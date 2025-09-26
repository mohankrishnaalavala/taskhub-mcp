/**
 * GitHub API Client
 * 
 * Provides authenticated GitHub API access with retry logic, rate limiting,
 * and repository allowlist validation.
 */

import { Octokit } from 'octokit';
import { Logger } from 'pino';
import { config, derivedConfig } from '../config/env.js';
import { createChildLogger } from './logger.js';
import { 
  Result, 
  success, 
  failure, 
  GitHubApiError, 
  AuthError, 
  ValidationError 
} from '../types/errors.js';

// GitHub API types
export interface GitHubRepo {
  owner: string;
  repo: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GitHubFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
  sha?: string; // For updates
}

export interface CreateBranchOptions {
  repo: GitHubRepo;
  branchName: string;
  fromBranch?: string; // defaults to default branch
  dryRun?: boolean;
}

export interface PushFilesOptions {
  repo: GitHubRepo;
  branch: string;
  files: GitHubFile[];
  commitMessage: string;
  dryRun?: boolean;
}

export interface CreatePullRequestOptions {
  repo: GitHubRepo;
  title: string;
  body: string;
  head: string; // branch name
  base?: string; // defaults to default branch
  draft?: boolean;
  dryRun?: boolean;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  draft: boolean;
  head: {
    ref: string; // branch name
    sha: string;
  };
  base: {
    ref: string; // base branch name
  };
}

export interface CreateReviewOptions {
  repo: GitHubRepo;
  pullNumber: number;
  body: string;
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
  dryRun?: boolean;
}

export interface GitHubReview {
  id: number;
  body: string;
  state: string;
  html_url: string;
}

/**
 * GitHub API client with authentication and retry logic
 */
export class GitHubClient {
  private octokit: Octokit;
  private logger: Logger;

  constructor(token: string) {
    this.logger = createChildLogger({ component: 'github-client' });
    
    this.octokit = new Octokit({
      auth: token,
      retry: {
        doNotRetry: ['400', '401', '403', '404', '422'],
      },
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          this.logger.warn('GitHub API rate limit hit', {
            retryAfter,
            method: options.method,
            url: options.url,
          });
          return true; // Retry after rate limit
        },
        onSecondaryRateLimit: (retryAfter: number, options: any) => {
          this.logger.warn('GitHub API secondary rate limit hit', {
            retryAfter,
            method: options.method,
            url: options.url,
          });
          return true; // Retry after secondary rate limit
        },
      },
    });
  }

  /**
   * Validate that a repository is in the allowed list
   */
  private validateRepo(repo: GitHubRepo): Result<void> {
    const repoString = `${repo.owner}/${repo.repo}`;
    
    if (!derivedConfig.allowedRepos.includes(repoString)) {
      return failure(new ValidationError(
        `Repository '${repoString}' is not in the allowed list`,
        'REPO_NOT_ALLOWED',
        { repo: repoString, allowedRepos: derivedConfig.allowedRepos }
      ));
    }
    
    return success(undefined);
  }

  /**
   * Test GitHub API authentication and permissions
   */
  async testAuthentication(): Promise<Result<{ user: string; scopes: string[] }>> {
    try {
      this.logger.debug('Testing GitHub authentication');
      
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      
      // Get token scopes from response headers (if available)
      const scopes: string[] = [];
      
      this.logger.info('GitHub authentication successful', {
        user: user.login,
        scopes,
      });
      
      return success({
        user: user.login,
        scopes,
      });
    } catch (error) {
      this.logger.error('GitHub authentication failed', { error });
      
      if (error instanceof Error) {
        const statusCode = (error as any).status;
        
        if (statusCode === 401) {
          return failure(new AuthError(
            'GitHub authentication failed - invalid token',
            'GITHUB_AUTH_FAILED',
            { statusCode },
            error
          ));
        }
        
        return failure(new GitHubApiError(
          `GitHub API error: ${error.message}`,
          'GITHUB_API_ERROR',
          { statusCode },
          undefined,
          error
        ));
      }
      
      return failure(new GitHubApiError(
        'Unknown GitHub API error',
        'GITHUB_API_ERROR',
        {},
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Get repository information
   */
  async getRepository(repo: GitHubRepo): Promise<Result<{ defaultBranch: string; private: boolean }>> {
    const repoValidation = this.validateRepo(repo);
    if (!repoValidation.success) {
      return repoValidation;
    }

    try {
      this.logger.debug('Getting repository information', { repo });
      
      const { data } = await this.octokit.rest.repos.get({
        owner: repo.owner,
        repo: repo.repo,
      });
      
      return success({
        defaultBranch: data.default_branch,
        private: data.private,
      });
    } catch (error) {
      this.logger.error('Failed to get repository information', { repo, error });
      
      if (error instanceof Error) {
        const statusCode = (error as any).status;
        
        if (statusCode === 404) {
          return failure(new ValidationError(
            `Repository '${repo.owner}/${repo.repo}' not found or not accessible`,
            'REPO_NOT_FOUND',
            { repo },
            error
          ));
        }
        
        return failure(new GitHubApiError(
          `Failed to get repository: ${error.message}`,
          'GITHUB_API_ERROR',
          { repo, statusCode },
          undefined,
          error
        ));
      }
      
      return failure(new GitHubApiError(
        'Unknown error getting repository',
        'GITHUB_API_ERROR',
        { repo },
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(options: CreateBranchOptions): Promise<Result<GitHubBranch>> {
    const repoValidation = this.validateRepo(options.repo);
    if (!repoValidation.success) {
      return repoValidation;
    }

    if (options.dryRun) {
      this.logger.info('DRY RUN: Would create branch', { options });
      return success({
        name: options.branchName,
        sha: 'dry-run-sha',
        protected: false,
      });
    }

    try {
      this.logger.debug('Creating branch', { options });
      
      // Get the source branch SHA
      const fromBranch = options.fromBranch || 'main';
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner: options.repo.owner,
        repo: options.repo.repo,
        ref: `heads/${fromBranch}`,
      });
      
      // Create the new branch
      const { data: newRef } = await this.octokit.rest.git.createRef({
        owner: options.repo.owner,
        repo: options.repo.repo,
        ref: `refs/heads/${options.branchName}`,
        sha: refData.object.sha,
      });
      
      this.logger.info('Branch created successfully', {
        repo: options.repo,
        branch: options.branchName,
        sha: newRef.object.sha,
      });
      
      return success({
        name: options.branchName,
        sha: newRef.object.sha,
        protected: false,
      });
    } catch (error) {
      this.logger.error('Failed to create branch', { options, error });
      
      if (error instanceof Error) {
        const statusCode = (error as any).status;
        
        if (statusCode === 422) {
          return failure(new ValidationError(
            `Branch '${options.branchName}' already exists`,
            'BRANCH_EXISTS',
            { branchName: options.branchName },
            error
          ));
        }
        
        return failure(new GitHubApiError(
          `Failed to create branch: ${error.message}`,
          'GITHUB_API_ERROR',
          { options, statusCode },
          undefined,
          error
        ));
      }
      
      return failure(new GitHubApiError(
        'Unknown error creating branch',
        'GITHUB_API_ERROR',
        { options },
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Push files to a branch
   */
  async pushFiles(options: PushFilesOptions): Promise<Result<{ commitSha: string; filesChanged: number }>> {
    const repoValidation = this.validateRepo(options.repo);
    if (!repoValidation.success) {
      return repoValidation;
    }

    if (options.dryRun) {
      this.logger.info('DRY RUN: Would push files', {
        repo: options.repo,
        branch: options.branch,
        filesCount: options.files.length,
        commitMessage: options.commitMessage,
      });
      return success({
        commitSha: 'dry-run-commit-sha',
        filesChanged: options.files.length,
      });
    }

    try {
      this.logger.debug('Pushing files to branch', {
        repo: options.repo,
        branch: options.branch,
        filesCount: options.files.length,
      });

      // Get the latest commit SHA for the branch
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner: options.repo.owner,
        repo: options.repo.repo,
        ref: `heads/${options.branch}`,
      });

      const latestCommitSha = refData.object.sha;

      // Get the tree for the latest commit
      const { data: latestCommit } = await this.octokit.rest.git.getCommit({
        owner: options.repo.owner,
        repo: options.repo.repo,
        commit_sha: latestCommitSha,
      });

      // Create blobs for all files
      const treeItems = await Promise.all(
        options.files.map(async (file) => {
          const { data: blob } = await this.octokit.rest.git.createBlob({
            owner: options.repo.owner,
            repo: options.repo.repo,
            content: file.encoding === 'base64' ? file.content : Buffer.from(file.content, 'utf-8').toString('base64'),
            encoding: 'base64',
          });

          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blob.sha,
          };
        })
      );

      // Create a new tree
      const { data: newTree } = await this.octokit.rest.git.createTree({
        owner: options.repo.owner,
        repo: options.repo.repo,
        base_tree: latestCommit.tree.sha,
        tree: treeItems,
      });

      // Create a new commit
      const { data: newCommit } = await this.octokit.rest.git.createCommit({
        owner: options.repo.owner,
        repo: options.repo.repo,
        message: options.commitMessage,
        tree: newTree.sha,
        parents: [latestCommitSha],
      });

      // Update the branch reference
      await this.octokit.rest.git.updateRef({
        owner: options.repo.owner,
        repo: options.repo.repo,
        ref: `heads/${options.branch}`,
        sha: newCommit.sha,
      });

      this.logger.info('Files pushed successfully', {
        repo: options.repo,
        branch: options.branch,
        commitSha: newCommit.sha,
        filesChanged: options.files.length,
      });

      return success({
        commitSha: newCommit.sha,
        filesChanged: options.files.length,
      });
    } catch (error) {
      this.logger.error('Failed to push files', { options, error });

      if (error instanceof Error) {
        const statusCode = (error as any).status;

        if (statusCode === 404) {
          return failure(new ValidationError(
            `Branch '${options.branch}' not found`,
            'BRANCH_NOT_FOUND',
            { branch: options.branch },
            error
          ));
        }

        return failure(new GitHubApiError(
          `Failed to push files: ${error.message}`,
          'GITHUB_API_ERROR',
          { options, statusCode },
          undefined,
          error
        ));
      }

      return failure(new GitHubApiError(
        'Unknown error pushing files',
        'GITHUB_API_ERROR',
        { options },
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(options: CreatePullRequestOptions): Promise<Result<GitHubPullRequest>> {
    const repoValidation = this.validateRepo(options.repo);
    if (!repoValidation.success) {
      return repoValidation;
    }

    if (options.dryRun) {
      this.logger.info('DRY RUN: Would create pull request', { options });
      return success({
        number: 999,
        title: options.title,
        body: options.body,
        url: `https://github.com/${options.repo.owner}/${options.repo.repo}/pull/999`,
        draft: options.draft || false,
        head: {
          ref: options.head,
          sha: 'dry-run-sha',
        },
        base: {
          ref: options.base || 'main',
        },
      });
    }

    try {
      this.logger.debug('Creating pull request', { options });

      // Get repository info for default branch if not specified
      let baseBranch = options.base;
      if (!baseBranch) {
        const repoInfoResult = await this.getRepository(options.repo);
        if (!repoInfoResult.success) {
          return repoInfoResult;
        }
        baseBranch = repoInfoResult.data.defaultBranch;
      }

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: options.repo.owner,
        repo: options.repo.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: baseBranch,
        draft: options.draft || false,
      });

      this.logger.info('Pull request created successfully', {
        repo: options.repo,
        prNumber: pr.number,
        title: pr.title,
        draft: pr.draft,
      });

      return success({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        url: pr.html_url,
        draft: pr.draft || false,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        base: {
          ref: pr.base.ref,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create pull request', { options, error });

      if (error instanceof Error) {
        const statusCode = (error as any).status;

        if (statusCode === 422) {
          return failure(new ValidationError(
            'Pull request creation failed - check if branch exists and has commits',
            'PR_CREATION_FAILED',
            { head: options.head, base: options.base },
            error
          ));
        }

        return failure(new GitHubApiError(
          `Failed to create pull request: ${error.message}`,
          'GITHUB_API_ERROR',
          { options, statusCode },
          undefined,
          error
        ));
      }

      return failure(new GitHubApiError(
        'Unknown error creating pull request',
        'GITHUB_API_ERROR',
        { options },
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  /**
   * Create a review on a pull request
   */
  async createReview(options: CreateReviewOptions): Promise<Result<GitHubReview>> {
    const repoValidation = this.validateRepo(options.repo);
    if (!repoValidation.success) {
      return repoValidation;
    }

    if (options.dryRun) {
      this.logger.info('DRY RUN: Would create review', { options });
      return success({
        id: 999,
        body: options.body,
        state: options.event.toLowerCase(),
        html_url: `https://github.com/${options.repo.owner}/${options.repo.repo}/pull/${options.pullNumber}#pullrequestreview-999`,
      });
    }

    try {
      this.logger.debug('Creating pull request review', { options });

      const { data: review } = await this.octokit.rest.pulls.createReview({
        owner: options.repo.owner,
        repo: options.repo.repo,
        pull_number: options.pullNumber,
        body: options.body,
        event: options.event,
      });

      this.logger.info('Review created successfully', {
        repo: options.repo,
        prNumber: options.pullNumber,
        reviewId: review.id,
        event: options.event,
      });

      return success({
        id: review.id,
        body: review.body || '',
        state: review.state,
        html_url: review.html_url,
      });
    } catch (error) {
      this.logger.error('Failed to create review', { options, error });

      if (error instanceof Error) {
        const statusCode = (error as any).status;

        if (statusCode === 404) {
          return failure(new ValidationError(
            `Pull request #${options.pullNumber} not found`,
            'PR_NOT_FOUND',
            { pullNumber: options.pullNumber },
            error
          ));
        }

        if (statusCode === 422) {
          return failure(new ValidationError(
            'Review creation failed - check if PR is in a reviewable state',
            'REVIEW_CREATION_FAILED',
            { pullNumber: options.pullNumber, event: options.event },
            error
          ));
        }

        return failure(new GitHubApiError(
          `Failed to create review: ${error.message}`,
          'GITHUB_API_ERROR',
          { options, statusCode },
          undefined,
          error
        ));
      }

      return failure(new GitHubApiError(
        'Unknown error creating review',
        'GITHUB_API_ERROR',
        { options },
        undefined,
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}

// Create a singleton GitHub client instance
let githubClient: GitHubClient | null = null;

/**
 * Get the GitHub client instance
 */
export function getGitHubClient(): Result<GitHubClient> {
  if (!config.GITHUB_TOKEN) {
    return failure(new AuthError(
      'GitHub token not configured',
      'GITHUB_TOKEN_MISSING',
      { envVar: 'GITHUB_TOKEN' }
    ));
  }

  if (!githubClient) {
    githubClient = new GitHubClient(config.GITHUB_TOKEN);
  }

  return success(githubClient);
}
