// An error we throw on purpose; `status` is the HTTP status, `message` is safe to show the user.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
module.exports = AppError;
