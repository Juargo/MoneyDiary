import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Suite de ejemplo que ejercita todo el toolchain de test del frontend
// (ADR-016): render bajo jsdom + queries de Testing Library + user-event +
// matchers de jest-dom. No prueba lógica de negocio; existe para verificar que
// el arnés de pruebas del web está montado.
function Contador() {
  const [n, setN] = useState(0)
  return (
    <div>
      <p>Valor: {n}</p>
      <button onClick={() => setN((v) => v + 1)}>Incrementar</button>
    </div>
  )
}

describe('smoke — Testing Library + jsdom', () => {
  it('renderiza y reacciona a la interacción del usuario', async () => {
    const user = userEvent.setup()
    render(<Contador />)

    expect(screen.getByText('Valor: 0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Incrementar' }))
    expect(screen.getByText('Valor: 1')).toBeInTheDocument()
  })
})
