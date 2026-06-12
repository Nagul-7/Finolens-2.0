export function Container({ children, className = '' }) {
  return (
    <div className={`max-w-screen-xl mx-auto px-5 sm:px-6 py-5 sm:py-6 ${className}`}>
      {children}
    </div>
  )
}
