import { useState, useCallback, useRef } from 'react'
import { useChatStore } from '../../store/chatSlice'
import { useQueueStore } from '../../store/queueSlice'
import type { ImageAttachment } from '../../types/chat'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_IMAGES = 4
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

interface Props {
  onSend: (content: string, images?: ImageAttachment[]) => void
  onStop: () => void
}

export function ChatInput({ onSend, onStop }: Props) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const queue = useQueueStore((s) => s.queue)

  const activeQueue = queue.filter((p) => p.status === 'pending' || p.status === 'processing')
  const queueVisible = activeQueue.length > 0

  const addImageFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => ALLOWED_TYPES.has(f.type) && f.size <= MAX_FILE_SIZE
    )

    for (const file of fileArray) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setImages((current) => {
          if (current.length >= MAX_IMAGES) return current
          return [
            ...current,
            {
              id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              dataUrl,
              fileName: file.name,
              mimeType: file.type,
            },
          ]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    const hasImages = images.length > 0

    if (!trimmed && !hasImages) return

    const content = trimmed || 'Analyze this image'
    onSend(content, hasImages ? images : undefined)
    setValue('')
    setImages([])
  }, [value, images, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData.files
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length > 0) {
        e.preventDefault()
        addImageFiles(imageFiles)
      }
    },
    [addImageFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
      if (files.length > 0) addImageFiles(files)
    },
    [addImageFiles]
  )

  const hasContent = value.trim() || images.length > 0

  return (
    <div className="p-3 border-t border-gray-200 dark:border-[#1e2636] bg-white dark:bg-[#0a0d15] transition-colors">
      {/* Image preview strip */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 px-1 flex-wrap">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.fileName}
                title={img.fileName}
                className="w-12 h-12 rounded-lg object-cover border border-gray-300 dark:border-gray-600"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-400"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-lg transition-colors ${
          isDragging ? 'ring-2 ring-blue-500 bg-blue-500/5' : ''
        }`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={images.length >= MAX_IMAGES}
          className="flex-shrink-0 p-2 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={images.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addImageFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={images.length > 0 ? 'Add a message or send images...' : 'Ask about your network...'}
          rows={1}
          className="flex-1 resize-none bg-gray-100 dark:bg-[#141c2b] border border-gray-400 dark:border-gray-400 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-colors"
          disabled={false}
        />
        {isProcessing && !queueVisible ? (
          <button
            onClick={onStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!hasContent || isProcessing}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
