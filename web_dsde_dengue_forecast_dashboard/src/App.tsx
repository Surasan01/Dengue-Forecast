import { useState } from 'react';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { DistrictDetailPanel } from './components/DistrictDetailPanel';
import { useApiBaseUrl } from './hooks/useApiBaseUrl';
import { useTheme } from './hooks/useTheme';
import { districts, District } from './data/districts';

export default function App() {
  useTheme();
  const { apiBaseUrl, saveApiBaseUrl } = useApiBaseUrl();
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 transition-colors">
      <Header apiBaseUrl={apiBaseUrl} onSaveApiUrl={saveApiBaseUrl} />
      
      <main className="flex-1 container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
          <div className="h-full min-h-[400px]">
            <MapView
              districts={districts}
              selectedDistrict={selectedDistrict}
              onSelectDistrict={setSelectedDistrict}
            />
          </div>
          
          <div className="h-full min-h-[400px]">
            <DistrictDetailPanel
              district={selectedDistrict}
              apiBaseUrl={apiBaseUrl}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
