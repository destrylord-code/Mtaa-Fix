import { MulterError } from 'multer';

export const notFoundHandler = (req, res) => {
  res.status(404).json({ status: 'error', message: 'Resource not found.' });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Request failed.';
  if (err instanceof MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 15 MB or smaller.' : err.code === 'LIMIT_FILE_COUNT' ? 'Upload at most five files.' : 'Invalid file upload.';
  } else if (err.code === 'P2002') { statusCode = 409; message = 'A record with these unique details already exists.'; }
  else if (err.code === 'P2025') { statusCode = 404; message = 'Record not found.'; }
  else if (err.code === 'P2003') { statusCode = 400; message = 'The selected related record is invalid.'; }
  else if (err.type === 'entity.too.large') { statusCode = 413; message = 'Request body is too large.'; }
  else if (err.type === 'entity.parse.failed') { statusCode = 400; message = 'Invalid JSON body.'; }
  else if (message.startsWith('Origin not allowed')) { statusCode = 403; message = 'Origin is not allowed.'; }
  else if (statusCode >= 500 && process.env.NODE_ENV === 'production') message = 'The service could not complete this request. Please try again.';
  if (statusCode >= 500) console.error('[API error]', { method: req.method, path: req.path, code: err.code, message: err.message });
  res.status(statusCode).json({ status: 'error', message, ...(statusCode >= 500 && process.env.NODE_ENV !== 'production' && { stack: err.stack }) });
};
export default { notFoundHandler, errorHandler };
