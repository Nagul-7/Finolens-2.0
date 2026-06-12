export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'px-3.5 py-2 text-body rounded-md font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-accent text-bg hover:bg-accent-dim',
    ghost: 'bg-transparent text-text-dim hover:text-text hover:bg-elevated border border-border',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
