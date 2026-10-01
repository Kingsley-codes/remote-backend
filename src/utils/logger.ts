type LogMetadata = Record<string, string | number | boolean | null | undefined>;

const readableLabel = (value: string) => {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._]/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const formatLog = (
  level: "info" | "error",
  event: string,
  metadata: LogMetadata,
) => {
  const timestamp = new Date().toISOString();
  const details = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (key === "stack") {
        return `  Stack trace:\n${String(value).split("\n").map((line) => `    ${line}`).join("\n")}`;
      }
      return `  ${readableLabel(key)}: ${String(value).replace(/\r?\n/g, "\n    ")}`;
    });

  return [`[${timestamp}] ${level.toUpperCase()} ${readableLabel(event)}`, ...details, ""].join("\n");
};

const errorSummary = (error: unknown) => {
  if (!(error instanceof Error)) return { errorType: "UnknownError" };
  const withCode = error as Error & {
    code?: string | number;
    status?: number;
    errors?: Record<string, unknown>;
  };
  return {
    errorType: error.name,
    errorCode: withCode.code,
    status: withCode.status,
    ...(error.name === "ValidationError" && withCode.errors
      ? { validationFields: Object.keys(withCode.errors).join(",") }
      : {}),
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
  console.error(formatLog("error", event, {
    ...metadata,
    ...errorSummary(error),
  }));
};

export const logInfo = (event: string, metadata: LogMetadata = {}) => {
  console.log(formatLog("info", event, metadata));
};
