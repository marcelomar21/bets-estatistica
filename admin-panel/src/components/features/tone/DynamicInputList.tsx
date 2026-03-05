'use client';

import React from 'react';

interface DynamicInputListProps {
  items: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength?: number;
  placeholder?: string;
  addLabel?: string;
  inputType?: 'input' | 'textarea';
  textareaRows?: number;
  labels?: string[];  // optional per-item labels like "CTA Primario", "CTA Secundario"
}

export default function DynamicInputList({
  items,
  onChange,
  maxItems,
  maxLength,
  placeholder = '',
  addLabel = '+ Adicionar',
  inputType = 'input',
  textareaRows = 3,
  labels,
}: DynamicInputListProps) {
  function handleChange(index: number, value: string) {
    const next = [...items];
    next[index] = maxLength ? value.slice(0, maxLength) : value;
    onChange(next);
  }

  function handleAdd() {
    if (items.length < maxItems) {
      onChange([...items, '']);
    }
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1">
            {labels && labels[index] && (
              <span className="block text-xs text-gray-500 mb-0.5">{labels[index]}</span>
            )}
            {inputType === 'textarea' ? (
              <textarea
                value={item}
                onChange={(e) => handleChange(index, e.target.value)}
                placeholder={placeholder}
                rows={textareaRows}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
            ) : (
              <input
                type="text"
                value={item}
                onChange={(e) => handleChange(index, e.target.value)}
                placeholder={placeholder}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
            {maxLength && (
              <span className="text-xs text-gray-400 mt-0.5 block text-right">{item.length}/{maxLength}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      {items.length < maxItems && (
        <button
          type="button"
          onClick={handleAdd}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}
