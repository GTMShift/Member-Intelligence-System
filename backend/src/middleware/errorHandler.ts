import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({ detail: err.issues });
    return;
  }
  const status = (err as { status?: number }).status ?? 500;
  const message = (err as Error).message ?? "Internal server error";
  res.status(status).json({ detail: message });
};
