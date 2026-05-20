import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRagStore } from '../../stores/ragStore';
import {
  createRagCollection,
  deleteRagCollection,
  deleteRagDocument,
  fetchRagDocuments,
  subscribeRagIndexJob,
  updateRagCollection,
  uploadRagDocument
} from '../../api/rag';
import MoreActionMenu from '../MoreActionMenu/MoreActionMenu';
import './RagPage.css';

const ACCEPT = '.txt,.md,.pdf,.docx';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const statusText = {
  failed: '失败',
  indexing: '索引中',
  pending: '等待中',
  ready: '可检索'
};

const emptyCollectionForm = {
  description: '',
  name: ''
};

const uploadStatusText = {
  done: '完成',
  error: '失败',
  indexing: '上传完成，索引中',
  uploading: '上传中',
  waiting: '等待中'
};

function getUploadStatusLabel(item) {
  if (item.status === 'uploading') return `${uploadStatusText[item.status]} · ${Math.min(item.progress, 100)}%`;
  if (item.status === 'indexing') {
    const detail = item.indexTotal > 0 ? ` · ${item.indexCurrent}/${item.indexTotal}` : '';
    return `${item.indexMessage || uploadStatusText[item.status]}${detail}`;
  }
  return uploadStatusText[item.status] || item.status;
}

function getItemProgress(item) {
  if (item.status === 'indexing') return Math.min(item.indexProgress || 0, 100);
  if (item.status === 'done' || item.status === 'error') return 100;
  return Math.min(item.progress || 0, 100);
}

function getItemOverallProgress(item) {
  if (item.status === 'done' || item.status === 'error') return 100;
  if (item.status === 'indexing') return 50 + (Math.min(item.indexProgress || 0, 100) / 2);
  if (item.status === 'uploading') return Math.min(item.progress || 0, 100) / 2;
  return 0;
}

function waitForIndexJob(jobId, onProgress) {
  return new Promise((resolve, reject) => {
    if (!jobId) {
      reject(new Error('索引任务创建失败'));
      return;
    }

    let settled = false;
    const close = subscribeRagIndexJob(jobId, {
      onProgress,
      onDone: (progress) => {
        if (settled) return;
        settled = true;
        onProgress?.(progress);
        resolve(progress);
      },
      onError: (error, progress) => {
        if (settled) return;
        settled = true;
        close();
        reject(new Error(progress?.error || error.message));
      }
    });
  });
}

const RagPage = () => {
  const ragCollections = useRagStore(s => s.ragCollections);
  const refreshRagCollections = useRagStore(s => s.refreshRagCollections);
  const selectedRagCollectionId = useRagStore(s => s.selectedRagCollectionId);
  const setSelectedRagCollectionId = useRagStore(s => s.setSelectedRagCollectionId);
  const [activeCollectionId, setActiveCollectionId] = useState(selectedRagCollectionId || '');
  const [documents, setDocuments] = useState([]);
  const [collectionForm, setCollectionForm] = useState(emptyCollectionForm);
  const [collectionEditor, setCollectionEditor] = useState(null);
  const [isCollectionEditorOpen, setIsCollectionEditorOpen] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const activeCollection = useMemo(
    () => ragCollections.find(collection => collection.id === activeCollectionId) || ragCollections[0],
    [activeCollectionId, ragCollections]
  );

  useEffect(() => {
    if (!activeCollectionId && ragCollections[0]) {
      setActiveCollectionId(ragCollections[0].id);
    }
  }, [activeCollectionId, ragCollections]);

  useEffect(() => {
    if (!activeCollection?.id) {
      setDocuments([]);
      return;
    }

    setIsLoadingDocuments(true);
    fetchRagDocuments(activeCollection.id)
      .then(setDocuments)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoadingDocuments(false));
  }, [activeCollection?.id]);

  const closeCollectionEditor = () => {
    setCollectionEditor(null);
    setCollectionForm(emptyCollectionForm);
    setIsCollectionEditorOpen(false);
  };

  const openCollectionEditor = (collection = null) => {
    setError('');
    setCollectionEditor(collection);
    setCollectionForm(collection ? {
      description: collection.description || '',
      name: collection.name || ''
    } : emptyCollectionForm);
    setIsCollectionEditorOpen(true);
  };

  const saveCollection = async (event) => {
    event.preventDefault();
    if (!collectionForm.name.trim()) return;

    setError('');
    setIsSavingCollection(true);
    try {
      if (collectionEditor) {
        await updateRagCollection(collectionEditor.id, collectionForm);
        await refreshRagCollections();
      } else {
        const collection = await createRagCollection(collectionForm);
        await refreshRagCollections();
        setActiveCollectionId(collection.id);
      }
      closeCollectionEditor();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingCollection(false);
    }
  };

  const handleRename = async () => {
    if (!activeCollection) return;
    setIsCollectionMenuOpen(false);
    openCollectionEditor(activeCollection);
  };

  const handleDeleteCollection = async () => {
    if (!activeCollection) return;
    setIsCollectionMenuOpen(false);
    if (!window.confirm(`删除知识库「${activeCollection.name}」及其全部文档？`)) return;

    setError('');
    try {
      await deleteRagCollection(activeCollection.id);
      if (selectedRagCollectionId === activeCollection.id) {
        setSelectedRagCollectionId('');
      }
      const collections = await refreshRagCollections();
      setActiveCollectionId(collections[0]?.id || '');
      setDocuments([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeCollection) return;

    setError('');
    setIsUploading(true);
    const uploadEntries = files.map((file, index) => ({
      file,
      id: `${Date.now()}-${index}-${file.name}`
    }));

    setUploadItems(uploadEntries.map(({ file, id }) => ({
      id,
      error: '',
      indexCurrent: 0,
      indexMessage: '',
      indexProgress: 0,
      indexTotal: 0,
      loaded: 0,
      name: file.name,
      progress: 0,
      size: file.size,
      status: 'waiting'
    })));

    const updateUploadItem = (id, patch) => {
      setUploadItems(prev => prev.map(item =>
        item.id === id
          ? { ...item, ...patch }
          : item
      ));
    };

    try {
      let hasFailedUpload = false;
      for (const { file, id } of uploadEntries) {
        updateUploadItem(id, { status: 'uploading', progress: 0, loaded: 0, error: '' });

        try {
          const result = await uploadRagDocument(activeCollection.id, file, {
            onProgress: ({ loaded, percent }) => {
              updateUploadItem(id, { loaded, progress: percent, status: percent >= 100 ? 'indexing' : 'uploading' });
            }
          });
          const job = result.jobs?.[0];
          await waitForIndexJob(job?.id, (progress) => {
            updateUploadItem(id, {
              indexCurrent: progress.current || 0,
              indexMessage: progress.message || uploadStatusText.indexing,
              indexProgress: progress.percent || 0,
              indexTotal: progress.total || 0,
              status: progress.status === 'completed' ? 'done' : 'indexing'
            });
          });
          updateUploadItem(id, { loaded: file.size, progress: 100, status: 'done' });
        } catch (err) {
          hasFailedUpload = true;
          updateUploadItem(id, { loaded: file.size, progress: 100, status: 'error', error: err.message });
        }
      }

      await refreshRagCollections();
      setDocuments(await fetchRagDocuments(activeCollection.id));

      if (!hasFailedUpload) {
        window.setTimeout(() => setUploadItems([]), 1600);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const totalUploadWeight = uploadItems.reduce((sum, item) => sum + (item.size || 1), 0);
  const totalUploadProgress = totalUploadWeight > 0
    ? Math.round(uploadItems.reduce((sum, item) => sum + getItemOverallProgress(item) * (item.size || 1), 0) / totalUploadWeight)
    : 0;
  const isAnyItemIndexing = uploadItems.some(item => item.status === 'indexing');
  const totalUploadLabel = isAnyItemIndexing
    ? `索引中 · ${Math.min(totalUploadProgress, 100)}%`
    : `${Math.min(totalUploadProgress, 100)}%`;

  const handleDeleteDocument = async (document) => {
    if (!window.confirm(`删除文档「${document.filename}」？`)) return;
    setError('');
    try {
      await deleteRagDocument(document.id);
      setDocuments(prev => prev.filter(item => item.id !== document.id));
      await refreshRagCollections();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="rag-page">
      <section className="rag-sidebar-panel">

        <button type="button" className="rag-add-collection" onClick={() => openCollectionEditor()}>
          <span aria-hidden="true">+</span>
          添加知识库
        </button>

        <div className="rag-collection-list">
          {ragCollections.map(collection => (
            <button
              type="button"
              className={`rag-collection-item ${collection.id === activeCollection?.id ? 'active' : ''}`}
              key={collection.id}
              onClick={() => setActiveCollectionId(collection.id)}
            >
              <span>{collection.name}</span>
              <small>{collection.documentCount} 文档 · {collection.chunkCount} chunks</small>
            </button>
          ))}
        </div>
      </section>

      <section className="rag-workbench">
        {activeCollection ? (
          <>
            <div className="rag-workbench-header">
              <div>
                <h2>{activeCollection.name}</h2>
                <p>{activeCollection.description || '暂无描述'}</p>
              </div>
              <div className="rag-header-actions">
                <MoreActionMenu
                  align="right"
                  isOpen={isCollectionMenuOpen}
                  onClose={() => setIsCollectionMenuOpen(false)}
                  onDelete={handleDeleteCollection}
                  onEdit={handleRename}
                  onToggle={() => setIsCollectionMenuOpen(open => !open)}
                />
              </div>
            </div>

            {error && <div className="rag-error" role="alert">{error}</div>}

            <div className="rag-upload-band">
              <div>
                <strong>上传并向量化</strong>
                <p>支持 TXT、MD、PDF、DOCX</p>
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPT} multiple onChange={handleUpload} hidden />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? '索引中…' : '选择文件'}
              </button>
            </div>

            {uploadItems.length > 0 ? (
              <div className="rag-upload-progress" aria-live="polite">
                {uploadItems.length > 1 ? (
                  <>
                    <div className="rag-upload-total">
                      <span>总进度</span>
                      <strong>{totalUploadLabel}</strong>
                    </div>
                    <div className={`rag-progress-track ${isAnyItemIndexing ? 'indexing' : ''}`}>
                      <span style={{ width: `${Math.min(totalUploadProgress, 100)}%` }} />
                    </div>
                  </>
                ) : null}
                <div className="rag-upload-items">
                  {uploadItems.map(item => (
                    <div className="rag-upload-item" key={item.id}>
                      <div className="rag-upload-item-head">
                        <span>{item.name}</span>
                        <small>{getUploadStatusLabel(item)}</small>
                      </div>
                      <div className={`rag-progress-track small ${item.status === 'indexing' ? 'indexing' : ''}`}>
                        <span style={{ width: `${getItemProgress(item)}%` }} />
                      </div>
                      {item.error ? <em>{item.error}</em> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rag-documents">
              <div className="rag-section-title">
                <h3>文档</h3>
                <span>{isLoadingDocuments ? '读取中…' : `${documents.length} 个文件`}</span>
              </div>
              {documents.length === 0 ? (
                <div className="rag-empty">还没有文档。上传文件后，聊天时就可以选择这个知识库检索。</div>
              ) : (
                <div className="rag-document-list">
                  {documents.map(document => (
                    <article className="rag-document-row" key={document.id}>
                      <div>
                        <strong>{document.filename}</strong>
                        <p>{formatSize(document.size)} · {document.chunkCount} chunks</p>
                        {document.errorMessage && <em>{document.errorMessage}</em>}
                      </div>
                      <span className={`rag-status ${document.status}`}>{statusText[document.status] || document.status}</span>
                      <button type="button" onClick={() => handleDeleteDocument(document)}>删除</button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rag-empty full">创建第一个知识库后，就可以上传文档并在聊天里启用 RAG。</div>
        )}
      </section>

      {isCollectionEditorOpen ? (
        <section
          className="rag-collection-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rag-collection-editor-title"
          onMouseDown={closeCollectionEditor}
        >
          <form className="rag-collection-form" onSubmit={saveCollection} onMouseDown={(event) => event.stopPropagation()}>
            <div className="rag-collection-form-heading">
              <h3 id="rag-collection-editor-title">
                {collectionEditor ? '编辑知识库' : '添加知识库'}
              </h3>
              <button type="button" className="rag-editor-close" onClick={closeCollectionEditor} aria-label="关闭">
                ×
              </button>
            </div>

            <label className="rag-collection-field">
              <span>名称</span>
              <input
                type="text"
                value={collectionForm.name}
                onChange={(event) => setCollectionForm(current => ({ ...current, name: event.target.value }))}
                placeholder="例如：前端面试"
                maxLength={80}
                autoFocus
              />
            </label>

            <label className="rag-collection-field">
              <span>描述</span>
              <textarea
                value={collectionForm.description}
                onChange={(event) => setCollectionForm(current => ({ ...current, description: event.target.value }))}
                placeholder="可选"
                rows={3}
                maxLength={500}
              />
            </label>

            <div className="rag-collection-actions">
              <button type="button" className="rag-secondary" onClick={closeCollectionEditor} disabled={isSavingCollection}>
                取消
              </button>
              <button type="submit" className="rag-primary" disabled={isSavingCollection || !collectionForm.name.trim()}>
                {isSavingCollection ? '保存中' : '保存'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
};

export default RagPage;
