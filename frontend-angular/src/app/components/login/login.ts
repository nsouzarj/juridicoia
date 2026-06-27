import { Component, signal, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../config';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  onLogin = output<string>();
  authService = inject(AuthService);

  email = signal<string>('');
  senha = signal<string>('');
  error = signal<string | null>(null);
  loading = signal<boolean>(false);
  showPassword = signal<boolean>(false);

  private http = inject(HttpClient);

  handleSubmit(e: Event) {
    e.preventDefault();
    const emailVal = this.email();
    const senhaVal = this.senha();

    if (!emailVal || !senhaVal) {
      this.error.set('Por favor, preencha todos os campos.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.http.post<any>(`${API_URL}/auth/login`, { email: emailVal, senha: senhaVal }).subscribe({
      next: (data) => {
        this.loading.set(false);
        if (data && data.access_token) {
          this.onLogin.emit(data.access_token);
        } else {
          this.error.set('Erro na resposta do servidor.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.error.set('E-mail ou senha incorretos.');
        } else {
          const detail = err.error?.detail || err.message || 'Erro desconhecido';
          this.error.set(`Erro ao conectar com o backend: ${detail}`);
        }
      }
    });
  }
}
