export const warnConfigIssue = (message: string): void => {
  process.stderr.write(`[itall-react-doctor] ${message}\n`);
};
