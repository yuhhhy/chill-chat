import { useCallback, useRef, useState } from "react";

export const FILE_ACCEPT = "text/plain,.txt,.md";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(file.name));
    reader.readAsText(file, "utf-8");
  });
}

export function useFileAttachment() {
  // Each entry: { id, file, content: string|null, loading: boolean, error: boolean }
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const addFiles = useCallback(async (fileList) => {
    const entries = Array.from(fileList).map(file => ({
      id: crypto.randomUUID(),
      file,
      content: null,
      loading: true,
      error: false,
    }));

    setAttachedFiles(prev => [...prev, ...entries]);

    for (const entry of entries) {
      try {
        const content = await readFileAsText(entry.file);
        setAttachedFiles(prev =>
          prev.map(item => item.id === entry.id ? { ...item, content, loading: false } : item)
        );
      } catch {
        setAttachedFiles(prev =>
          prev.map(item => item.id === entry.id ? { ...item, loading: false, error: true } : item)
        );
      }
    }
  }, []);

  const removeFile = useCallback((index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return { attachedFiles, fileInputRef, openFilePicker, addFiles, removeFile, clearFiles };
}
