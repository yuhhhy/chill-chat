import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchSessions,
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession
} from '../api/sessions.js';

export function useSessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);

  const currentSessionId = location.pathname.match(/^\/chat\/(.+)$/)?.[1] ?? null;

  useEffect(() => {
    const initialSessionId = location.pathname.match(/^\/chat\/(.+)$/)?.[1] ?? null;
    fetchSessions().then(data => {
      setSessions(data);
      if (initialSessionId) return;
      if (data.length > 0) {
        navigate(`/chat/${data[0].id}`, { replace: true });
      } else {
        apiCreateSession().then(session => {
          setSessions([session]);
          navigate(`/chat/${session.id}`, { replace: true });
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createNewSession = useCallback(async () => {
    const session = await apiCreateSession();
    setSessions(prev => [session, ...prev]);
    navigate(`/chat/${session.id}`);
  }, [navigate]);

  const loadSession = useCallback((id) => {
    navigate(`/chat/${id}`);
  }, [navigate]);

  const deleteSession = useCallback(async (id) => {
    await apiDeleteSession(id);
    const remaining = sessions.filter(s => s.id !== id);
    setSessions(remaining);
    if (currentSessionId === id) {
      if (remaining.length > 0) {
        navigate(`/chat/${remaining[0].id}`);
      } else {
        const session = await apiCreateSession();
        setSessions([session]);
        navigate(`/chat/${session.id}`);
      }
    }
  }, [currentSessionId, navigate, sessions]);

  const updateSession = useCallback((session) => {
    setSessions(prev => prev.map(s => s.id === session.id ? session : s));
  }, []);

  return { sessions, currentSessionId, createNewSession, loadSession, deleteSession, updateSession };
}
