/**
 * Tabs Component
 * A tabbed interface with keyboard navigation support
 */

import { useState, ReactNode, KeyboardEvent, Children, cloneElement, isValidElement } from 'react';

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export interface TabListProps {
  children: ReactNode;
  className?: string;
}

export interface TabProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface TabPanelsProps {
  children: ReactNode;
  className?: string;
}

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tabs component for organizing content into tabbed views
 */
export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className = '',
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue || '');
  const isControlled = controlledValue !== undefined;
  const activeValue = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(newValue);
    }
    if (onValueChange) {
      onValueChange(newValue);
    }
  };

  return (
    <div className={className}>
      {Children.map(children, (child) => {
        if (isValidElement(child)) {
          return cloneElement(child as any, {
            activeValue,
            onValueChange: handleValueChange,
          });
        }
        return child;
      })}
    </div>
  );
}

/**
 * TabList component containing Tab buttons
 */
export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div
      className={`flex border-b border-gray-200 ${className}`}
      role="tablist"
      aria-orientation="horizontal"
    >
      {children}
    </div>
  );
}

/**
 * Tab button component
 */
export function Tab({ value, children, disabled = false, className = '' }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected="false"
      aria-disabled={disabled}
      disabled={disabled}
      className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className} `}
      data-tab-value={value}
    >
      {children}
    </button>
  );
}

/**
 * TabPanels component containing TabPanel content
 */
export function TabPanels({ children, className = '' }: TabPanelsProps) {
  return <div className={className}>{children}</div>;
}

/**
 * TabPanel component for tab content
 */
export function TabPanel({ value, children, className = '' }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      aria-labelledby={`tab-${value}`}
      className={className}
      data-tab-panel-value={value}
    >
      {children}
    </div>
  );
}

/**
 * Complete Tabs component with internal state management
 */
export function ControlledTabs({
  defaultValue,
  children,
  className = '',
}: Omit<TabsProps, 'value' | 'onValueChange'>) {
  const [activeValue, setActiveValue] = useState(defaultValue || '');

  const tabs = Children.toArray(children).filter(
    (child): child is React.ReactElement<TabProps> => isValidElement(child) && child.type === Tab
  );

  const panels = Children.toArray(children).filter(
    (child): child is React.ReactElement<TabPanelProps> =>
      isValidElement(child) && child.type === TabPanel
  );

  const handleTabClick = (value: string) => {
    setActiveValue(value);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const tabsCount = tabs.length;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        const prevIndex = currentIndex === 0 ? tabsCount - 1 : currentIndex - 1;
        const prevTab = tabs[prevIndex].props as TabProps;
        if (!prevTab.disabled) {
          setActiveValue(prevTab.value);
          (event.target as HTMLButtonElement).previousElementSibling
            ?.querySelector('button')
            ?.focus();
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        const nextIndex = currentIndex === tabsCount - 1 ? 0 : currentIndex + 1;
        const nextTab = tabs[nextIndex].props as TabProps;
        if (!nextTab.disabled) {
          setActiveValue(nextTab.value);
          (event.target as HTMLButtonElement).nextElementSibling?.querySelector('button')?.focus();
        }
        break;
      case 'Home':
        event.preventDefault();
        const firstTab = tabs[0].props as TabProps;
        if (!firstTab.disabled) {
          setActiveValue(firstTab.value);
        }
        break;
      case 'End':
        event.preventDefault();
        const lastTab = tabs[tabsCount - 1].props as TabProps;
        if (!lastTab.disabled) {
          setActiveValue(lastTab.value);
        }
        break;
    }
  };

  return (
    <div className={className}>
      <TabList>
        {tabs.map((tab, index) => {
          const isActive = tab.props.value === activeValue;
          return (
            <Tab
              key={tab.props.value}
              value={tab.props.value}
              disabled={tab.props.disabled}
              onClick={() => handleTabClick(tab.props.value)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`${tab.props.className || ''} ${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              } ${tab.props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} `}
              aria-selected={isActive}
            >
              {tab.props.children}
            </Tab>
          );
        })}
      </TabList>
      <TabPanels>
        {panels.map((panel) => {
          const isActive = panel.props.value === activeValue;
          return (
            <TabPanel key={panel.props.value} {...panel.props} className={isActive ? '' : 'hidden'}>
              {panel.props.children}
            </TabPanel>
          );
        })}
      </TabPanels>
    </div>
  );
}
