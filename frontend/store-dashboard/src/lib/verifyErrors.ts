import { ApiError } from '../api/client'

export interface VerifyFailure {
  /** Short, specific reason shown in large type on the red screen. */
  title: string
  /** What the staff member should do about it. */
  detail: string
}

/** Maps backend pickup-verification errors to specific, actionable messages. */
export function describeVerifyError(error: unknown): VerifyFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'credential_expired':
        return { title: 'Code expired', detail: 'Ask the customer to open their order and tap “Get a new code”.' }
      case 'credential_already_used':
        return { title: 'Already used', detail: 'This order was already handed over. Do not hand over again.' }
      case 'credential_wrong_store':
        return { title: 'Wrong store', detail: 'This order belongs to a different store. Send the customer there.' }
      case 'order_not_ready':
        return { title: 'Order not ready', detail: 'This order has not been marked ready yet. Finish preparing it first.' }
      case 'too_many_attempts':
        return { title: 'Too many wrong attempts', detail: 'The code is locked. Ask the customer to refresh it, or scan their QR code.' }
      case 'invalid_credential':
        return { title: 'Invalid code', detail: 'That code is not valid. Check it and try again, or scan the QR code.' }
      case 'validation_error':
        return { title: 'Invalid code format', detail: 'Enter the digits shown on the customer’s phone.' }
      default:
        if (error.isNetwork) return { title: 'No connection', detail: 'Check the network and try again. Nothing was handed over.' }
        return { title: 'Could not verify', detail: error.message }
    }
  }
  return { title: 'Could not verify', detail: error instanceof Error ? error.message : 'Unexpected error.' }
}
