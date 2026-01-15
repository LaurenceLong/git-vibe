/**
 * Tab Navigation Component
 * NOTE: This component is now deprecated.
 * Tab navigation has been moved to Layout.tsx for GitHub-style UI.
 * This file is kept for backward compatibility but is no longer used.
 */

import React from 'react';
import { Link } from '@tanstack/react-router';

export interface Tab {
  id: string;
  label: string;
  path?: string;
  icon?: React.ReactNode;
}

export interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
}

/**
 * @deprecated Tab navigation is now handled by Layout.tsx
 */
export function TabNavigation({ tabs, activeTab }: TabNavigationProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex space-x-6" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          if (tab.path) {
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`flex items-center space-x-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } `}
                role="tab"
                aria-selected={isActive}
              >
                {tab.icon && <span className="text-base">{tab.icon}</span>}
                <span>{tab.label}</span>
              </Link>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                window.history.pushState({}, '', `?tab=${tab.id}`);
              }}
              className={`flex items-center space-x-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              } `}
              role="tab"
              aria-selected={isActive}
            >
              {tab.icon && <span className="text-base">{tab.icon}</span>}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
