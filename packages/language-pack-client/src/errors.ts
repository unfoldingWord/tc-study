export const CLIENT_ERROR_CODES = [
  'E_DOWNGRADE',
  'E_COMMON',
  'E_NO_BASE',
  'E_NO_PACK',
  'E_NETWORK',
  'E_STORE',
  'E_NOT_INSTALLED',
  'E_ARG',
] as const

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number]

export class ClientError extends Error {
  code: ClientErrorCode
  status?: number
  retryAfter?: number
  constructor(
    code: ClientErrorCode,
    message?: string,
    extra: { status?: number; retryAfter?: number } = {},
  ) {
    super(message ? `${code}: ${message}` : code)
    this.name = 'ClientError'
    this.code = code
    if (extra.status !== undefined) this.status = extra.status
    if (extra.retryAfter !== undefined) this.retryAfter = extra.retryAfter
  }
}
