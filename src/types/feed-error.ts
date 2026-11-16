// A translated feed error that can be shown to the user.
export class FeedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
