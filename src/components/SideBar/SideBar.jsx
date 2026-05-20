import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom';
import './SideBar.css'
import { assets } from '../../assets/assets'
import { useSessionStore } from '../../stores/sessionStore';
import { renameSession } from '../../api/sessions';
import { EditIcon } from '../icons/ActionIcons';

const COLLAPSED_WIDTH = 68;
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

const SideBar = ({ onOpenSettings }) => {
    const [extended, setExtended] = useState(true);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [isDragging, setIsDragging] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editingTitle, setEditingTitle] = useState('');
    const isResizing = useRef(false);
    const location = useLocation();
    const navigate = useNavigate();

    const sessions = useSessionStore(s => s.sessions);
    const currentSessionId = useSessionStore(s => s.currentSessionId);
    const createNewSession = useSessionStore(s => s.createNewSession);
    const loadSession = useSessionStore(s => s.loadSession);
    const deleteSession = useSessionStore(s => s.deleteSession);
    const updateSession = useSessionStore(s => s.updateSession);

    const startEditingSession = (session) => {
        setEditingSessionId(session.id);
        setEditingTitle(session.title);
    };

    const cancelEditingSession = () => {
        setEditingSessionId(null);
        setEditingTitle('');
    };

    const submitSessionTitle = async (session) => {
        const title = editingTitle.trim();
        cancelEditingSession();
        if (!title || title === session.title) return;
        updateSession({ ...session, title });
        try {
            await renameSession(session.id, title);
        } catch {
            updateSession(session);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing.current) return;
            setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
        };
        const handleMouseUp = () => {
            isResizing.current = false;
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div
            className={`sidebar ${extended ? '' : 'collapsed'} ${isDragging ? 'resizing' : ''}`}
            style={{ width: extended ? width : COLLAPSED_WIDTH }}
        >
            <div className="top">
                <img className='menu' src={assets.menu_icon} alt="" onClick={() => setExtended(!extended)} />
                <div onClick={() => createNewSession()} className="new-chat">
                    <img src={assets.plus_icon} alt="" />
                    <p className="label">New Chat</p>
                </div>
                <div className="recent">
                    <p className='recent-title label'>Recent</p>
                    <div className="recent-list">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => {
                                    if (editingSessionId) return;
                                    loadSession(session.id);
                                }}
                                className={`recent-entry ${session.id === currentSessionId ? 'active' : ''}`}
                            >
                                {editingSessionId === session.id ? (
                                    <form
                                        className="session-title-form"
                                        onClick={(e) => e.stopPropagation()}
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            submitSessionTitle(session);
                                        }}
                                    >
                                        <input
                                            className="session-title-input"
                                            value={editingTitle}
                                            onChange={(e) => setEditingTitle(e.target.value)}
                                            onBlur={() => submitSessionTitle(session)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    submitSessionTitle(session);
                                                }
                                                if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    cancelEditingSession();
                                                }
                                            }}
                                            maxLength={80}
                                            autoFocus
                                            aria-label="修改会话名称"
                                        />
                                    </form>
                                ) : (
                                    <>
                                        <p className="label session-title" title={session.title}>{session.title}</p>
                                        <button
                                            type="button"
                                            className="session-action edit-session"
                                            title="重命名"
                                            aria-label={`重命名 ${session.title}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEditingSession(session);
                                            }}
                                        >
                                            <EditIcon />
                                        </button>
                                    </>
                                )}
                                <img
                                    src={assets.trash}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                    }}
                                    alt=""
                                    className="delete-icon"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="bottom">
                <div
                    className={`bottom-item recent-entry ${location.pathname === '/rag' ? 'active' : ''}`}
                    onClick={() => navigate('/rag')}
                >
                    <img src={assets.rag_icon} alt="" />
                    <p className="label">RAG</p>
                </div>
                <div className="bottom-item recent-entry" onClick={onOpenSettings}>
                    <img src={assets.setting_icon} alt="" />
                    <p className="label">Setting</p>
                </div>
            </div>
            {extended && (
                <div
                    className="resize-handle"
                    onMouseDown={(e) => {
                        isResizing.current = true;
                        setIsDragging(true);
                        e.preventDefault();
                    }}
                />
            )}
        </div>
    )
}

export default SideBar;
