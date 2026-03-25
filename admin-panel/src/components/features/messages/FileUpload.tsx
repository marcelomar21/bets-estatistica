'use client';

import { useState, useRef, useCallback } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};
const ACCEPT_STRING = Object.keys(ACCEPTED_TYPES).join(',');

interface FileUploadProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ onFileSelected, disabled, error: externalError }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = useCallback((file: File) => {
    setValidationError('');

    if (!ACCEPTED_TYPES[file.type]) {
      setValidationError('Tipo de arquivo nao suportado. Apenas PDF, JPG e PNG.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setValidationError('Arquivo excede o limite de 10MB.');
      return;
    }

    setSelectedFile(file);
    onFileSelected(file);
  }, [onFileSelected]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleRemove() {
    setSelectedFile(null);
    setValidationError('');
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const displayError = validationError || externalError;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Anexar arquivo (opcional)
      </label>

      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
            ${isDragging ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-gray-400'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <p className="text-sm text-gray-600">
            Arraste um arquivo ou clique para selecionar
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, JPG ou PNG (max 10MB)
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_STRING}
            onChange={handleChange}
            disabled={disabled}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <span className="text-lg">
            {selectedFile.type === 'application/pdf' ? '📄' : '🖼️'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">
              {ACCEPTED_TYPES[selectedFile.type]} — {formatFileSize(selectedFile.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      )}

      {displayError && (
        <p className="mt-1 text-sm text-red-600">{displayError}</p>
      )}
    </div>
  );
}
