import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, kind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-24 md:bottom-6 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm w-full sm:w-auto px-4 py-2.5 rounded-md border text-body shadow-elevated ${
              t.kind === 'error'
                ? 'bg-elevated border-negative/50 text-text'
                : 'bg-elevated border-accent/50 text-text'
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${
                t.kind === 'error' ? 'bg-negative' : 'bg-accent'
              }`}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
