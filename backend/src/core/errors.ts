export class NotFoundError extends Error {
  status = 404;
  constructor(message = "Not found") {
    super(message);
  }
}

export class ValidationError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
  }
}

export class UpstreamError extends Error {
  status = 502;
  upstreamStatus?: number;
  constructor(message: string, upstreamStatus?: number) {
    super(message);
    this.upstreamStatus = upstreamStatus;
  }
}
