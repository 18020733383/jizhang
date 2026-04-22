import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiGet, apiPost } from '../lib/api';

interface PrivacyLevel {
  itemType: string;
  itemId: string;
  level: number;
}

interface PrivacyContextType {
  userTrustLevel: number;
  privacyLevels: Record<string, Record<string, number>>;
  canViewItem: (itemType: string, itemId: string, requiredLevel?: number) => boolean;
  setPrivacyLevel: (itemType: string, itemId: string, level: number) => Promise<void>;
  isBlurred: (itemType: string, itemId: string) => boolean;
  refreshPrivacyLevels: () => Promise<void>;
}

const PrivacyContext = createContext<PrivacyContextType | null>(null);

export function PrivacyProvider({ 
  children, 
  userTrustLevel,
  userId 
}: { 
  children: ReactNode;
  userTrustLevel: number;
  userId: string;
}) {
  const [privacyLevels, setPrivacyLevels] = useState<Record<string, Record<string, number>>>({});

  const refreshPrivacyLevels = async () => {
    if (userTrustLevel < 3) {
      try {
        const data = await apiGet<{ levels: Record<string, Record<string, number>> }>('/auth/privacy');
        setPrivacyLevels(data.levels);
      } catch (e) {
        console.error('Failed to load privacy levels:', e);
      }
    }
  };

  useEffect(() => {
    refreshPrivacyLevels();
  }, [userTrustLevel, userId]);

  const canViewItem = (itemType: string, itemId: string, requiredLevel: number = 1): boolean => {
    if (userTrustLevel >= 3) return true;
    
    const itemLevel = privacyLevels[itemType]?.[itemId] ?? 1;
    return userTrustLevel >= itemLevel;
  };

  const isBlurred = (itemType: string, itemId: string): boolean => {
    if (userTrustLevel >= 3) return false;
    return !canViewItem(itemType, itemId);
  };

  const setPrivacyLevel = async (itemType: string, itemId: string, level: number) => {
    if (userTrustLevel < 3) return;
    
    try {
      await apiPost('/auth/privacy', { itemType, itemId, privacyLevel: level });
      await refreshPrivacyLevels();
    } catch (e) {
      console.error('Failed to set privacy level:', e);
    }
  };

  return (
    <PrivacyContext.Provider value={{
      userTrustLevel,
      privacyLevels,
      canViewItem,
      setPrivacyLevel,
      isBlurred,
      refreshPrivacyLevels,
    }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within PrivacyProvider');
  }
  return context;
}

export function useItemPrivacy(itemType: string, itemId: string) {
  const { canViewItem, isBlurred, setPrivacyLevel, userTrustLevel } = usePrivacy();
  
  return {
    canView: canViewItem(itemType, itemId),
    isBlurred: isBlurred(itemType, itemId),
    setPrivacyLevel: (level: number) => setPrivacyLevel(itemType, itemId, level),
    isAdmin: userTrustLevel >= 3,
  };
}
