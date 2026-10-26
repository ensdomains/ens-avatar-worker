export const getErrorMessage = (e: unknown, prefix = "") => {
  if (e instanceof Error) return prefix + e.message;
  else if (typeof e === "string") return prefix + e;
  return prefix + JSON.stringify(e);
};
