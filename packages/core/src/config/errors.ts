export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
  readonly source: 'config' | 'env';
}

function safeMessage(issue: ConfigIssue): string {
  if (issue.path === 'database.url' && /(required|undefined)/i.test(issue.message)) {
    return 'Required secret. Set DATABASE_URL in the environment.';
  }
  return issue.message;
}

export function formatConfigIssues(issues: readonly ConfigIssue[]): string {
  const seen = new Set<string>();
  const unique = issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lines = unique.map((issue) => {
    const suffix = issue.source === 'env' ? ' (environment)' : '';
    return `  - ${issue.path}: ${safeMessage(issue)}${suffix}`;
  });

  return [`Invalid configuration:`, ...lines].join('\n');
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(formatConfigIssues(issues));
    this.name = 'ConfigError';
    this.issues = issues;
  }
}
