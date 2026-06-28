import { Injectable, signal, computed, effect } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_URL } from '../config';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenSignal = signal<string | null>(sessionStorage.getItem('token') || null);
  userSignal = signal<any | null>(null);
  private themeSignal = signal<'dark' | 'light'>((localStorage.getItem('praxis-theme') as 'dark' | 'light') || 'dark');

  token = computed(() => this.tokenSignal());
  user = computed(() => this.userSignal());
  isAuthenticated = computed(() => !!this.tokenSignal());
  theme = computed(() => this.themeSignal());

  // Toast notifications system
  toasts = signal<Array<{ id: number; message: string; type: 'success' | 'error' | 'info' }>>([]);
  private nextToastId = 0;

  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    const id = this.nextToastId++;
    this.toasts.update(current => [...current, { id, message, type }]);
    
    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      this.removeToast(id);
    }, 4000);
  }

  removeToast(id: number): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  constructor(private http: HttpClient) {
    // Aplica o tema inicial (claro/escuro)
    document.documentElement.setAttribute('data-theme', this.themeSignal());

    // Restaura todas as preferências visuais do localStorage imediatamente,
    // inclusive na tela de login e após o logout, sem esperar pelo DashboardComponent
    const colorTheme = localStorage.getItem('praxis-color-theme') || 'emerald';
    const navLayout = localStorage.getItem('praxis-nav-layout') || 'sidebar';
    const densityLayout = localStorage.getItem('praxis-density-layout') || 'default';
    const geometryLayout = localStorage.getItem('praxis-geometry-layout') || 'default';
    const bgTheme = localStorage.getItem('praxis-bg-theme') || 'default';

    document.documentElement.setAttribute('data-color-theme', colorTheme);
    document.documentElement.setAttribute('data-nav-layout', navLayout);
    document.documentElement.setAttribute('data-layout-density', densityLayout);
    document.documentElement.setAttribute('data-layout-geometry', geometryLayout);
    document.documentElement.setAttribute('data-bg-theme', bgTheme);

    // Automatically fetch user profile when token changes
    effect(() => {
      const token = this.tokenSignal();
      if (token) {
        this.fetchProfile(token).subscribe({
          next: (profile) => this.userSignal.set(profile),
          error: (err) => {
            console.error('Failed to get profile:', err);
            this.logout();
          }
        });
      } else {
        this.userSignal.set(null);
      }
    }, { allowSignalWrites: true });
  }

  toggleTheme(): void {
    const next = this.themeSignal() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('praxis-theme', next);
    this.themeSignal.set(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  login(token: string): void {
    sessionStorage.setItem('token', token);
    this.tokenSignal.set(token);
  }

  logout(): void {
    sessionStorage.removeItem('token');
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  private fetchProfile(token: string): Observable<any> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
    return this.http.get(`${API_URL}/auth/me`, { headers });
  }
}
