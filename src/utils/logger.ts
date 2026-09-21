type LogMetadata = Record<string, string | number | boolean | null | undefined>;

const errorSummary = (error: unknown) => {
  if (!(error instanceof Error)) return { errorType: "UnknownError" };
  const withCode = error as Error & { code?: string | number; status?: number };
  return {
    errorType: error.name,
    errorCode: withCode.code,
    status: withCode.status,
    ...(process.env.NODE_ENV === "development"
      ? { errorMessage: error.message, stack: error.stack }
      : {}),
  };
};

export const logError = (
  event: string,
  error: unknown,
  metadata: LogMetadata = {},
) => {
  console.error(JSON.stringify({
    level: "error",
    event,
    ...metadata,
    ...errorSummary(error),
    timestamp: new Date().toISOString(),
  }));
};

export const logInfo = (event: string, metadata: LogMetadata = {}) => {
  console.log(JSON.stringify({
    level: "info",
    event,
    ...metadata,
    timestamp: new Date().toISOString(),
  }));
};
