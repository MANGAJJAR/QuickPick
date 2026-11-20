import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cleanCode } from '../lib/code'
import { Keypad } from './Keypad'

function Harness({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  const [v, setV] = useState('')
  return <><Keypad value={v} onChange={setV} onSubmit={onSubmit} /><output data-testid="value">{v}</output></>
}

describe('Keypad code entry', () => {
  it('accepts typing on the physical keyboard', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText(/pickup code/i), '482915')
    expect(screen.getByTestId('value')).toHaveTextContent('482915')
  })

  it('accepts a pasted code, stripping spaces/dashes and extra digits', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByLabelText(/pickup code/i))
    await userEvent.paste('482 915-99')
    expect(screen.getByTestId('value')).toHaveTextContent('482915')
  })

  it('still works with the on-screen keys, and Enter submits once there are 4+ digits', async () => {
    const submit = vi.fn()
    render(<Harness onSubmit={submit} />)
    for (const d of ['1', '2', '3', '4']) await userEvent.click(screen.getByLabelText(`Digit ${d}`))
    expect(screen.getByTestId('value')).toHaveTextContent('1234')
    await userEvent.type(screen.getByLabelText(/pickup code/i), '{Enter}')
    expect(submit).toHaveBeenCalled()
  })

  it('cleanCode drops non-digits and caps the length', () => {
    expect(cleanCode('12a 34-56789', 6)).toBe('123456')
  })
})
