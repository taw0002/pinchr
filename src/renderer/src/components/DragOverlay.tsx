import { motion } from 'framer-motion'
import { FileUp } from 'lucide-react'

const ACCEPTED_HINTS = 'Images, PDF, Markdown, Text, Code files'

export default function DragOverlay(): React.ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-accent/5 backdrop-blur-sm"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="flex flex-col items-center gap-3 pointer-events-none select-none"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
          <FileUp className="h-8 w-8 text-accent" />
        </div>
        <p className="text-sm font-semibold text-text-primary">Drop files here</p>
        <p className="text-xs text-text-muted">{ACCEPTED_HINTS}</p>
      </motion.div>
    </motion.div>
  )
}
