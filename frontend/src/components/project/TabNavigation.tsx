/**
 * Tab Navigation Component
 * Reusable tab navigation component for project shell
 */

import React from 'react';

export interface Tab {
  id: string;
  label: string;
}

export interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
}

export function TabNavigation({ tabs, activeTab }: TabNavigationProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex space-x-8" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                // Navigate to tab - this will be handled by parent component
                window.history.pushState({}, '', `?tab=${tab.id}`);
              }}
              className={`border-b-2 px-4 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              } `}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
