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

  token = computed(() => this.tokenSignal());
  user = computed(() => this.userSignal());
  isAuthenticated = computed(() => !!this.tokenSignal());

  constructor(private http: HttpClient) {
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
