import { ThemeToggle } from './ThemeToggle';
import { ApiConfigBar } from './ApiConfigBar';

interface HeaderProps {
  apiBaseUrl: string;
  onSaveApiUrl: (url: string) => void;
}

export function Header({ apiBaseUrl, onSaveApiUrl }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🦟</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dengue Forecast Dashboard
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                ระบบพยากรณ์โรคไข้เลือดออก
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <ApiConfigBar apiBaseUrl={apiBaseUrl} onSave={onSaveApiUrl} />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
