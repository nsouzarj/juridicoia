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

  constructor(private http: HttpClient) {
    // Aplica o tema inicial
    document.documentElement.setAttribute('data-theme', this.themeSignal());

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
