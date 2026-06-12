import { useEffect, useState } from 'react'
import { Container } from '../components/layout/Container.jsx'
import { Card, CardLabel } from '../components/ui/Card.jsx'
import { Skeleton } from '../components/ui/Skeleton.jsx'
import { api } from '../lib/api'

export default function Settings() {
  const [auth, setAuth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .getAuthStatus()
      .then(setAuth)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <Container>
      <h1 className="text-head font-semibold mb-4">Settings</h1>
      {error && <div className="text-negative text-body mb-4">{error}</div>}

      <Card className="p-4 max-w-md">
        <CardLabel>Broker</CardLabel>
        {!auth ? (
          <Skeleton className="h-6 w-40 mt-3" />
        ) : (
          <div className="mt-3 space-y-2 text-body">
            <Row label="Mode" value={auth.mode} />
            <Row
              label="Status"
              value={auth.authenticated ? 'Connected' : 'Not authenticated'}
              positive={auth.authenticated}
            />
          </div>
        )}
      </Card>
    </Container>
  )
}

function Row({ label, value, positive }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-dim">{label}</span>
      <span className={positive ? 'text-accent font-medium' : 'text-text font-medium'}>
        {value}
      </span>
    </div>
  )
}
