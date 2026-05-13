'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  };

  return (
    <div className="bg-white h-full min-h-screen">
      <Sidebar onCollapse={handleSidebarCollapse} />
      {/* En mobile: sin padding porque la sidebar no ocupa espacio (está desacoplada) */}
      {/* En desktop: padding según el estado de la sidebar */}
      <div className={`lg:transition-all lg:duration-300 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-56'}`}>
        <main className="">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout; 