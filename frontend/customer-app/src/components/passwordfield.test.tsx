import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PasswordField } from './PasswordField'

function Harness() {
  const [v, setV] = useState('hunter22')
  return <PasswordField label="Password" labelClassName="" inputClassName="" value={v} onChange={setV} autoComplete="current-password" />
}

describe('PasswordField', () => {
  it('hides the password by default and toggles visibility', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
