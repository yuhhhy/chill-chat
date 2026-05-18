import { useCallback, useRef, useState } from "react";

export function useFileAttachment() {
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const addFiles = useCallback((fileList) => {
    setAttachedFiles((prev) => [...prev, ...Array.from(fileList)]);
  }, []);

  const removeFile = useCallback((index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return { attachedFiles, fileInputRef, openFilePicker, addFiles, removeFile, clearFiles };
}
