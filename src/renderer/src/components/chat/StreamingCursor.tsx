import { motion } from 'framer-motion'

export function StreamingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity }}
      className="inline-block h-4 w-2 rounded-sm bg-accent align-middle"
      aria-hidden
    />
  )
}
