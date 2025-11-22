import { useState, useEffect } from 'react';

export function useApiBaseUrl() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => {
    return localStorage.getItem('apiBaseUrl') || '';
  });

  const saveApiBaseUrl = (url: string) => {
    localStorage.setItem('apiBaseUrl', url);
    setApiBaseUrl(url);
  };

  return { apiBaseUrl, saveApiBaseUrl };
}
