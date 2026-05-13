'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface MenuItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  children?: MenuItem[];
}

interface MenuCategory {
  name: string;
  items: MenuItem[];
}

interface SidebarProps {
  onCollapse?: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onCollapse }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop) {
        setCollapsed(false);
        if (onCollapse) onCollapse(false);
      } else {
        setCollapsed(true);
        if (onCollapse) onCollapse(true);
      }
    }
  }, [onCollapse]);

  const menuCategories: MenuCategory[] = [
    {
      name: 'General',
      items: [
        {
          name: 'Dashboard',
          path: '/dashboard',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
      ],
    },
    {
      name: 'Comercial',
      items: [
        {
          name: 'Chats',
          path: '/chat',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          ),
        },
        {
          name: 'Leads',
          path: '/leads',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
          children: [
            {
              name: 'Lista de difusión',
              path: '/leads/lista-difusion',
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-[16px] w-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              ),
            },
          ],
        },
        {
          name: 'Calendario de llamadas',
          path: '/calendario-llamadas',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
        },
      ],
    },
    {
      name: 'Outbound',
      items: [
        {
          name: 'Envíos masivos',
          path: '/envios-masivos',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ),
        },
        {
          name: 'Mensajes programados',
          path: '/mensajes-programados',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
      ],
    },
  ];

  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuCategories.forEach((category) => {
      category.items.forEach((item) => {
        if (item.children?.length) {
          initial[item.path] = false;
        }
      });
    });
    return initial;
  });

  useEffect(() => {
    setOpenItems((prev) => {
      let changed = false;
      const next = { ...prev };
      menuCategories.forEach((category) => {
        category.items.forEach((item) => {
          if (item.children?.some((c) => pathname === c.path) && !next[item.path]) {
            next[item.path] = true;
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [pathname]);

  const toggleItem = (path: string) => {
    setOpenItems((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const toggleSidebar = () => {
    const newCollapsedState = !collapsed;
    setCollapsed(newCollapsedState);
    if (onCollapse) {
      onCollapse(newCollapsedState);
    }
  };

  return (
    <>
      {/* Botón flotante para abrir sidebar - Solo en mobile */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-[100] bg-foreground hover:bg-foreground/90 text-background rounded-lg p-2.5 shadow-lg transition-all duration-200 active:scale-95"
        aria-label="Abrir menú"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay para cerrar sidebar en mobile */}
      {mounted && !collapsed && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
          onClick={() => {
            setCollapsed(true);
            if (onCollapse) onCollapse(true);
          }}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "flex h-screen flex-col bg-card border-r border-border transition-all duration-300 z-[95]",
        collapsed ? "w-16" : "w-56",
        "lg:fixed lg:left-0 lg:top-0",
        "fixed left-0 top-0",
        collapsed
          ? "-translate-x-full lg:translate-x-0"
          : "translate-x-0"
      )}>
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-sm font-semibold">
                O
              </div>
              <div className="font-semibold text-[15px] tracking-tight text-foreground">Opting</div>
            </div>
          )}
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-5">
            {menuCategories.map((category) => (
              <div key={category.name} className="space-y-0.5">
                {/* Category Label (estático, no colapsable) */}
                {!collapsed && (
                  <div className="px-2 pb-1.5 pt-1">
                    <span className="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted-foreground/70">
                      {category.name}
                    </span>
                  </div>
                )}

                {/* Category Items */}
                <div className="space-y-0.5">
                  {category.items.map((item) => {
                    const isActive = pathname === item.path;
                    const hasChildren = !!item.children?.length;
                    const itemOpen = openItems[item.path];
                    const hasActiveChild = item.children?.some((c) => pathname === c.path);

                    return (
                      <div key={`${category.name}-${item.path}-${item.name}`}>
                        <div className="flex items-center gap-0.5">
                          <Link
                            href={item.path}
                            className={cn(
                              "group relative flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-all duration-150",
                              isActive
                                ? "bg-accent text-foreground font-medium"
                                : hasActiveChild
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                            )}
                            title={collapsed ? item.name : undefined}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-foreground" />
                            )}
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                              {item.icon}
                            </span>
                            {!collapsed && (
                              <span className="truncate">{item.name}</span>
                            )}
                          </Link>
                          {hasChildren && !collapsed && (
                            <button
                              type="button"
                              onClick={() => toggleItem(item.path)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
                              aria-label={itemOpen ? 'Colapsar' : 'Expandir'}
                            >
                              <svg
                                className={cn(
                                  "h-3 w-3 transition-transform duration-200",
                                  itemOpen ? "rotate-90" : "rotate-0"
                                )}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </div>

                        {hasChildren && !collapsed && itemOpen && (
                          <div className="mt-0.5 ml-[18px] space-y-0.5 border-l border-border pl-2">
                            {item.children!.map((child) => {
                              const childActive = pathname === child.path;
                              return (
                                <Link
                                  key={child.path}
                                  href={child.path}
                                  className={cn(
                                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors duration-150",
                                    childActive
                                      ? "bg-accent text-foreground font-medium"
                                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                  )}
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                    {child.icon}
                                  </span>
                                  <span className="truncate">{child.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">Usuario admin</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Admin</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
