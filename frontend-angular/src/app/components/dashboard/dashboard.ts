import { Component, signal, computed, effect, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { API_URL } from '../../config';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private http = inject(HttpClient);

  // Layout states
  activeTab = signal<number>(0);
  activeRagTab = signal<number>(0); // 0 = Precedentes, 1 = Matérias Jurídicas
  colorTheme = signal<string>(localStorage.getItem('praxis-color-theme') || 'emerald');
  navLayout = signal<string>(localStorage.getItem('praxis-nav-layout') || 'sidebar');
  densityLayout = signal<string>(localStorage.getItem('praxis-density-layout') || 'default');
  geometryLayout = signal<string>(localStorage.getItem('praxis-geometry-layout') || 'default');

  // Data signals
  processos = signal<any[]>([]);
  jurisprudencias = signal<any[]>([]);
  pastas = signal<any[]>([]);
  materias = signal<any[]>([]);
  usuarios = signal<any[]>([]);
  stats = signal<any>({
    total_processos: 0,
    status_counts: {},
    materia_counts: {},
    tipo_peca_counts: {}
  });

  // UI state signals
  currentPage = signal<number>(1);
  searchProcessoQuery = signal<string>('');
  selectedProcessIds = signal<number[]>([]);
  selectedRevisorId = signal<string>('');
  procIdToProcess = signal<string>('');
  newPastaCaminho = signal<string>('');
  salvarRag = signal<boolean>(true);
  activeReviewTab = signal<number>(0);
  showPasswordUser = signal<boolean>(false);
  selectedProcesso = signal<any | null>(null);

  // Modals & messages
  isReviewModalOpen = signal<boolean>(false);
  reviewingProcess = signal<any | null>(null);
  isPrecedentModalOpen = signal<boolean>(false);
  editingPrecedent = signal<any | null>(null);
  isEditUserModalOpen = signal<boolean>(false);
  
  editingUser = signal<any>({
    id: '',
    nome: '',
    email: '',
    senha: '',
    cargo: 'advogado',
    oab: ''
  });

  confirmDialog = signal<any>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'Confirmar'
  });

  processingMessage = signal<string | null>(null);

  // Feedback Messages
  procMsg = signal<{ type: string; text: string } | null>(null);
  jurMsg = signal<{ type: string; text: string } | null>(null);
  userMsg = signal<{ type: string; text: string } | null>(null);
  csvProcMsg = signal<{ type: string; text: string } | null>(null);
  csvJurMsg = signal<{ type: string; text: string } | null>(null);
  pastaMsg = signal<{ type: string; text: string } | null>(null);
  reviewMsg = signal<{ type: string; text: string } | null>(null);

  // Forms Binding models
  cadastroJur = signal<any>({ ementa: '', tribunal: '', processo: '', materia: '' });
  cadastroUser = signal<any>({ nome: '', email: '', senha: '', cargo: 'advogado', oab: '' });

  private intervalId: any = null;

  // Pagination computations
  itemsPerPage = 10;

  filteredProcessos = computed(() => {
    const query = this.searchProcessoQuery().toLowerCase();
    const list = this.processos();
    if (!query) return list;

    return list.filter((p) => {
      const materiaName = p.contexto_dinamico?.materia || '';
      const pecaName = p.contexto_dinamico?.tipo_peca || '';
      return (
        (p.numero_processo || '').toLowerCase().includes(query) ||
        (p.cliente || '').toLowerCase().includes(query) ||
        (p.status || '').toLowerCase().includes(query) ||
        materiaName.toLowerCase().includes(query) ||
        pecaName.toLowerCase().includes(query)
      );
    });
  });

  totalPages = computed(() => {
    return Math.ceil(this.filteredProcessos().length / this.itemsPerPage) || 1;
  });

  paginatedProcessos = computed(() => {
    const page = this.currentPage();
    const start = (page - 1) * this.itemsPerPage;
    return this.filteredProcessos().slice(start, start + this.itemsPerPage);
  });

  checkableProcessos = computed(() => {
    return this.paginatedProcessos().filter(
      (p) => p.status === 'PENDENTE' || p.status === 'ERRO_PROCESSAMENTO'
    );
  });

  isAllSelected = computed(() => {
    const checkable = this.checkableProcessos();
    const selected = this.selectedProcessIds();
    return checkable.length > 0 && checkable.every((p) => selected.includes(p.id));
  });

  // SVG Chart computation
  svgChartParams = computed(() => {
    const total = this.stats().total_processos || 0;
    const p = this.stats().status_counts?.PENDENTE || 0;
    const pr = this.stats().status_counts?.PROCESSANDO || 0;
    const rev = this.stats().status_counts?.REVISAO || 0;
    const err = this.stats().status_counts?.ERRO_PROCESSAMENTO || 0;
    const prot = this.stats().status_counts?.PROTOCOLADO || 0;

    const circ = 2 * Math.PI * 40; // 251.32
    
    const pPct = total > 0 ? (p / total) * circ : 0;
    const prPct = total > 0 ? (pr / total) * circ : 0;
    const revPct = total > 0 ? (rev / total) * circ : 0;
    const errPct = total > 0 ? (err / total) * circ : 0;
    const protPct = total > 0 ? (prot / total) * circ : 0;

    return {
      total,
      circ,
      pPct,
      prPct,
      revPct,
      errPct,
      protPct,
      pOffset: 0,
      prOffset: -pPct,
      revOffset: -(pPct + prPct),
      errOffset: -(pPct + prPct + revPct),
      protOffset: -(pPct + prPct + revPct + errPct),
      pShow: pPct > 0,
      prShow: prPct > 0,
      revShow: revPct > 0,
      errShow: errPct > 0,
      protShow: protPct > 0
    };
  });

  pieSlices = computed(() => {
    const stats = this.stats();
    const counts = stats.status_counts || {};
    
    const data = [
      { name: 'Pendentes', count: counts.PENDENTE || 0, color: '#e67e22' },
      { name: 'Em Processo', count: counts.PROCESSANDO || 0, color: '#3498db' },
      { name: 'Revisão', count: counts.REVISAO || 0, color: '#2ecc71' },
      { name: 'Aprovados', count: counts.PROTOCOLADO || 0, color: '#1abc9c' },
      { name: 'Falhas', count: counts.ERRO_PROCESSAMENTO || 0, color: '#e74c3c' }
    ];

    const total = data.reduce((acc, curr) => acc + curr.count, 0);
    if (total === 0) return [];

    let startAngle = 0;
    const slices = [];

    for (const item of data) {
      if (item.count === 0) continue;

      const percentage = (item.count / total) * 100;
      const angle = (item.count / total) * 360;
      const endAngle = startAngle + angle;

      const radStart = ((startAngle - 90) * Math.PI) / 180;
      const radEnd = ((endAngle - 90) * Math.PI) / 180;

      const r = 40; 
      const cx = 50; 
      const cy = 50; 

      const x1 = cx + r * Math.cos(radStart);
      const y1 = cy + r * Math.sin(radStart);
      const x2 = cx + r * Math.cos(radEnd);
      const y2 = cy + r * Math.sin(radEnd);

      const largeArcFlag = angle > 180 ? 1 : 0;

      let d = '';
      if (angle >= 360) {
        d = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
      } else {
        d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      }

      slices.push({
        ...item,
        percentage,
        path: d
      });

      startAngle = endAngle;
    }

    return slices;
  });

  statsPercentages = computed(() => {
    const stats = this.stats();
    const total = stats.total_processos || 0;
    const counts = stats.status_counts || {};
    
    return {
      total,
      pendente: total > 0 ? ((counts.PENDENTE || 0) / total) * 100 : 0,
      processando: total > 0 ? ((counts.PROCESSANDO || 0) / total) * 100 : 0,
      revisao: total > 0 ? ((counts.REVISAO || 0) / total) * 100 : 0,
      protocolado: total > 0 ? ((counts.PROTOCOLADO || 0) / total) * 100 : 0,
      erro: total > 0 ? ((counts.ERRO_PROCESSAMENTO || 0) / total) * 100 : 0
    };
  });

  // Object keys helper for templates
  get statsMateriaEntries() {
    return Object.entries(this.stats().materia_counts || {}).map(([key, val]) => ({
      materia: key,
      count: val as number
    }));
  }

  get statsTipoPecaEntries() {
    return Object.entries(this.stats().tipo_peca_counts || {}).map(([key, val]) => ({
      peca: key,
      count: val as number
    }));
  }

  get maxMateriaValue() {
    const vals = Object.values(this.stats().materia_counts || {}) as number[];
    return Math.max(...vals, 1);
  }

  get maxTipoPecaValue() {
    const vals = Object.values(this.stats().tipo_peca_counts || {}) as number[];
    return Math.max(...vals, 1);
  }

  constructor() {
    // Effects to sync layout settings to document root
    effect(() => {
      const color = this.colorTheme();
      document.documentElement.setAttribute('data-color-theme', color);
      localStorage.setItem('praxis-color-theme', color);
    });

    effect(() => {
      const nav = this.navLayout();
      document.documentElement.setAttribute('data-nav-layout', nav);
      localStorage.setItem('praxis-nav-layout', nav);
    });

    effect(() => {
      const density = this.densityLayout();
      document.documentElement.setAttribute('data-layout-density', density);
      localStorage.setItem('praxis-density-layout', density);
    });

    effect(() => {
      const geometry = this.geometryLayout();
      document.documentElement.setAttribute('data-layout-geometry', geometry);
      localStorage.setItem('praxis-geometry-layout', geometry);
    });

    // Fetch tab-dependent data when activeTab changes
    effect(() => {
      const tab = this.activeTab();
      const currentUser = this.authService.user();
      
      // Se o usuário logado for admin, carrega a lista de revisores/usuários necessária para a Fila (Tab 0) e Configurações (Tab 2)
      if (currentUser && currentUser.cargo === 'admin') {
        this.fetchUsuarios();
      }

      if (tab === 2) {
        this.fetchJurisprudencias();
        this.fetchMaterias();
      } else if (tab === 3 && currentUser && currentUser.cargo === 'admin') {
        this.fetchPastas();
      }
    });
  }

  ngOnInit() {
    this.fetchOnLoad();
    this.intervalId = setInterval(() => {
      this.fetchProcessos();
      this.fetchStats();
    }, 5000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private get headers(): HttpHeaders {
    const token = this.authService.token();
    return new HttpHeaders({
      Authorization: `Bearer ${token || ''}`
    });
  }

  private fetchOnLoad() {
    this.fetchProcessos();
    this.fetchStats();
    this.fetchMaterias();
    const currentUser = this.authService.user();
    if (currentUser && currentUser.cargo === 'admin') {
      this.fetchUsuarios();
    }
  }

  // Network Fetch methods
  fetchProcessos() {
    this.http.get<any[]>(`${API_URL}/processos`, { headers: this.headers }).subscribe({
      next: (data) => {
        this.processos.set(data);
        // Clear invalid selections
        const checkableIds = new Set(
          data.filter((p) => p.status === 'PENDENTE' || p.status === 'ERRO_PROCESSAMENTO').map((p) => p.id)
        );
        this.selectedProcessIds.update((prev) => prev.filter((id) => checkableIds.has(id)));
      },
      error: (err) => {
        console.error('Erro ao buscar processos:', err);
        if (err.status === 401) this.authService.logout();
      }
    });
  }

  fetchStats() {
    this.http.get<any>(`${API_URL}/processos/estatisticas`, { headers: this.headers }).subscribe({
      next: (data) => this.stats.set(data),
      error: (err) => console.error('Erro ao buscar estatísticas:', err)
    });
  }

  fetchJurisprudencias() {
    this.http.get<any[]>(`${API_URL}/jurisprudencia/list`, { headers: this.headers }).subscribe({
      next: (data) => this.jurisprudencias.set(data),
      error: (err) => console.error('Erro ao buscar jurisprudências:', err)
    });
  }

  fetchPastas() {
    this.http.get<any[]>(`${API_URL}/admin/pastas`, { headers: this.headers }).subscribe({
      next: (data) => this.pastas.set(data),
      error: (err) => console.error('Erro ao buscar pastas:', err)
    });
  }

  fetchMaterias() {
    this.http.get<any[]>(`${API_URL}/materias`, { headers: this.headers }).subscribe({
      next: (data) => this.materias.set(data),
      error: (err) => console.error('Erro ao buscar materias:', err)
    });
  }

  fetchUsuarios() {
    this.http.get<any[]>(`${API_URL}/admin/usuarios`, { headers: this.headers }).subscribe({
      next: (data) => this.usuarios.set(data),
      error: (err) => console.error('Erro ao buscar usuários:', err)
    });
  }

  // Confirmation Modal helper
  confirmAction(title: string, message: string, onConfirmCallback: () => void, confirmText = 'Confirmar') {
    this.confirmDialog.set({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        this.confirmDialog.update((d) => ({ ...d, isOpen: false }));
        onConfirmCallback();
      },
      confirmText
    });
  }

  // Action methods
  handleProcessCase(e: Event) {
    e.preventDefault();
    const procId = this.procIdToProcess();
    if (!procId) return;

    this.procMsg.set(null);
    this.processingMessage.set('Iniciando processamento da petição...');

    this.http.post<any>(`${API_URL}/processos/${procId}/processar`, {}, { headers: this.headers }).subscribe({
      next: () => {
        this.procMsg.set({
          type: 'success',
          text: 'Processamento iniciado em background! Atualize a página em alguns instantes.'
        });
        this.procIdToProcess.set('');
        this.fetchProcessos();
        this.processingMessage.set(null);
      },
      error: (err) => {
        this.procMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao processar caso.' });
        this.processingMessage.set(null);
      }
    });
  }

  handleSelectAll() {
    if (this.isAllSelected()) {
      const checkableIds = this.checkableProcessos().map((p) => p.id);
      this.selectedProcessIds.update((prev) => prev.filter((id) => !checkableIds.includes(id)));
    } else {
      const checkableIds = this.checkableProcessos().map((p) => p.id);
      this.selectedProcessIds.update((prev) => Array.from(new Set([...prev, ...checkableIds])));
    }
  }

  handleSelectProcess(id: number) {
    this.selectedProcessIds.update((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  handleBatchProcess() {
    const selectedIds = this.selectedProcessIds();
    if (selectedIds.length === 0) return;

    const revisorId = this.selectedRevisorId();

    this.confirmAction(
      'Processar Lote',
      `Deseja enviar ${selectedIds.length} processo(s) para geração automática de peças com a IA?`,
      () => {
        this.procMsg.set(null);
        this.processingMessage.set('Iniciando processamento em lote...');

        const payload = {
          ids: selectedIds,
          revisor_id: revisorId ? parseInt(revisorId) : null
        };

        this.http.post<any>(`${API_URL}/processos/processar-lote`, payload, { headers: this.headers }).subscribe({
          next: (data) => {
            this.procMsg.set({
              type: 'success',
              text: data.message || 'Processamento em lote iniciado em segundo plano!'
            });
            this.selectedProcessIds.set([]);
            this.fetchProcessos();
            this.processingMessage.set(null);
          },
          error: (err) => {
            this.procMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao processar lote.' });
            this.processingMessage.set(null);
          }
        });
      },
      'Iniciar IA'
    );
  }

  // Precedents CRUD
  handleCadastroJurisprudencia(e: Event) {
    e.preventDefault();
    const form = this.cadastroJur();
    if (!form.ementa || !form.tribunal || !form.processo || !form.materia) {
      this.jurMsg.set({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    const editMode = this.editingPrecedent();
    const title = editMode ? 'Editar Precedente' : 'Cadastrar Precedente';
    const message = editMode
      ? 'Deseja salvar as alterações neste precedente? Ele será re-vetorizado no RAG.'
      : 'Deseja cadastrar este novo precedente na base de dados do RAG?';

    this.confirmAction(title, message, () => {
      this.jurMsg.set(null);
      this.processingMessage.set(
        editMode
          ? 'Atualizando precedente e recalculando embeddings...'
          : 'Vetorizando precedente na base de dados...'
      );

      const request = editMode
        ? this.http.put<any>(`${API_URL}/jurisprudencia/${editMode.id}`, form, { headers: this.headers })
        : this.http.post<any>(`${API_URL}/jurisprudencia`, form, { headers: this.headers });

      request.subscribe({
        next: () => {
          this.jurMsg.set({
            type: 'success',
            text: editMode ? 'Precedente atualizado com sucesso!' : 'Precedente cadastrado com sucesso!'
          });
          this.cadastroJur.set({ ementa: '', tribunal: '', processo: '', materia: '' });
          this.editingPrecedent.set(null);
          this.isPrecedentModalOpen.set(false);
          this.fetchJurisprudencias();
          this.processingMessage.set(null);
        },
        error: (err) => {
          this.jurMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao salvar precedente.' });
          this.processingMessage.set(null);
        }
      });
    });
  }

  openCreatePrecedentModal() {
    this.jurMsg.set(null);
    this.editingPrecedent.set(null);
    this.cadastroJur.set({ ementa: '', tribunal: '', processo: '', materia: '' });
    this.isPrecedentModalOpen.set(true);
  }

  openEditPrecedentModal(precedent: any) {
    this.jurMsg.set(null);
    this.editingPrecedent.set(precedent);
    this.cadastroJur.set({
      ementa: precedent.ementa,
      tribunal: precedent.tribunal || '',
      processo: precedent.processo_referencia || '',
      materia: precedent.materia || ''
    });
    this.isPrecedentModalOpen.set(true);
  }

  openDeletePrecedentConfirm(precedent: any) {
    this.confirmAction(
      'Confirmar Exclusão',
      `Você tem certeza que deseja excluir o precedente com a ementa iniciada em: "${precedent.ementa.substring(
        0,
        50
      )}..."? Esta ação é irreversível e removerá permanentemente o vetor de busca do RAG.`,
      () => {
        this.jurMsg.set(null);
        this.processingMessage.set('Removendo precedente da base de dados...');

        this.http.delete<any>(`${API_URL}/jurisprudencia/${precedent.id}`, { headers: this.headers }).subscribe({
          next: () => {
            this.jurMsg.set({ type: 'success', text: 'Precedente excluído com sucesso!' });
            this.fetchJurisprudencias();
            this.processingMessage.set(null);
          },
          error: (err) => {
            this.jurMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao excluir precedente.' });
            this.processingMessage.set(null);
          }
        });
      },
      'Excluir Precedente'
    );
  }

  // Operator Account Creation
  handleCadastroUser(e: Event) {
    e.preventDefault();
    const form = this.cadastroUser();
    if (!form.nome || !form.email || !form.senha || !form.cargo) {
      this.userMsg.set({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    this.confirmAction(
      'Confirmar Cadastro',
      `Deseja realmente cadastrar o novo operador: ${form.nome}?`,
      () => {
        this.userMsg.set(null);
        this.http.post<any>(`${API_URL}/auth/register`, form, { headers: this.headers }).subscribe({
          next: () => {
            this.userMsg.set({ type: 'success', text: `Conta criada com sucesso para ${form.nome}!` });
            this.cadastroUser.set({ nome: '', email: '', senha: '', cargo: 'advogado', oab: '' });
            this.fetchUsuarios();
          },
          error: (err) => {
            this.userMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao registrar usuário.' });
          }
        });
      }
    );
  }

  openEditModal(userToEdit: any) {
    this.userMsg.set(null);
    this.editingUser.set({
      id: userToEdit.id,
      nome: userToEdit.nome,
      email: userToEdit.email,
      senha: '',
      cargo: userToEdit.cargo,
      oab: userToEdit.oab || ''
    });
    this.isEditUserModalOpen.set(true);
  }

  handleEditUser(e: Event) {
    e.preventDefault();
    const form = this.editingUser();
    if (!form.nome || !form.email || !form.cargo) {
      this.userMsg.set({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    this.confirmAction(
      'Confirmar Edição',
      `Deseja realmente salvar as alterações para o operador: ${form.nome}?`,
      () => {
        this.userMsg.set(null);
        const payload = {
          nome: form.nome,
          email: form.email,
          senha: form.senha || null,
          cargo: form.cargo,
          oab: form.oab
        };

        this.http
          .put<any>(`${API_URL}/admin/usuarios/${form.id}`, payload, { headers: this.headers })
          .subscribe({
            next: () => {
              this.userMsg.set({ type: 'success', text: `Usuário ${form.nome} atualizado com sucesso!` });
              this.isEditUserModalOpen.set(false);
              this.fetchUsuarios();
            },
            error: (err) => {
              this.userMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao editar usuário.' });
            }
          });
      }
    );
  }

  openDeleteConfirm(userToDelete: any) {
    this.confirmAction(
      'Confirmar Exclusão',
      `Você tem certeza que deseja excluir o operador: ${userToDelete.nome}? Esta ação é irreversível.`,
      () => {
        this.userMsg.set(null);
        this.http.delete<any>(`${API_URL}/admin/usuarios/${userToDelete.id}`, { headers: this.headers }).subscribe({
          next: () => {
            this.userMsg.set({ type: 'success', text: `Usuário ${userToDelete.nome} excluído com sucesso!` });
            this.fetchUsuarios();
          },
          error: (err) => {
            this.userMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao excluir usuário.' });
          }
        });
      },
      'Excluir'
    );
  }

  // Folder Configuration CRUD
  handleCadastroPasta(e: Event) {
    e.preventDefault();
    const caminho = this.newPastaCaminho();
    if (!caminho) {
      this.pastaMsg.set({ type: 'error', text: 'Preencha o caminho da pasta.' });
      return;
    }

    this.confirmAction('Cadastrar Pasta', `Deseja cadastrar a pasta de saída: "${caminho}"?`, () => {
      this.pastaMsg.set(null);
      this.http.post<any>(`${API_URL}/admin/pastas`, { caminho }, { headers: this.headers }).subscribe({
        next: () => {
          this.pastaMsg.set({ type: 'success', text: 'Pasta cadastrada com sucesso!' });
          this.newPastaCaminho.set('');
          this.fetchPastas();
        },
        error: (err) => {
          this.pastaMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao cadastrar pasta.' });
        }
      });
    });
  }

  handleAtivarPasta(pastaId: number) {
    this.confirmAction('Ativar Pasta', 'Deseja definir esta pasta como a pasta ativa de saída do sistema?', () => {
      this.pastaMsg.set(null);
      this.http.post<any>(`${API_URL}/admin/pastas/${pastaId}/ativar`, {}, { headers: this.headers }).subscribe({
        next: () => {
          this.pastaMsg.set({ type: 'success', text: 'Pasta ativada com sucesso!' });
          this.fetchPastas();
        },
        error: (err) => {
          this.pastaMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao ativar pasta.' });
        }
      });
    });
  }

  openDeletePastaConfirm(pasta: any) {
    this.confirmAction(
      'Confirmar Exclusão',
      `Tem certeza que deseja excluir a pasta de saída "${pasta.caminho}"?`,
      () => {
        this.pastaMsg.set(null);
        this.http.delete<any>(`${API_URL}/admin/pastas/${pasta.id}`, { headers: this.headers }).subscribe({
          next: () => {
            this.pastaMsg.set({ type: 'success', text: 'Pasta removida com sucesso!' });
            this.fetchPastas();
          },
          error: (err) => {
            this.pastaMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao excluir pasta.' });
          }
        });
      },
      'Excluir Pasta'
    );
  }

  // Review Modal operations
  handleOpenReviewModal(processo: any) {
    this.reviewMsg.set(null);
    this.activeReviewTab.set(0);
    this.salvarRag.set(true);

    let ctx = processo.contexto_dinamico || {};
    if (typeof ctx === 'string') {
      try {
        ctx = JSON.parse(ctx);
      } catch {
        ctx = {};
      }
    }
    if (!ctx || typeof ctx !== 'object') {
      ctx = {};
    }

    let teses: string[] = [];
    if (ctx.teses_principais) {
      if (Array.isArray(ctx.teses_principais)) {
        teses = [...ctx.teses_principais];
      } else if (typeof ctx.teses_principais === 'string') {
        teses = ctx.teses_principais
          .split('\n')
          .map((t: string) => t.trim())
          .filter((t: string) => t);
      }
    }

    this.reviewingProcess.set({
      id: processo.id,
      numero_processo: processo.numero_processo || '',
      cliente: processo.cliente || '',
      status: processo.status || '',
      juizo: ctx.juizo || '',
      tipo_peca: ctx.tipo_peca || 'Contestação',
      resumo_fatos: ctx.resumo_fatos || '',
      teses_principais: teses,
      materia: ctx.materia || 'Geral',
      data_prazo: processo.data_prazo ? processo.data_prazo.split('T')[0] : '',
      fundamentacao_revisada: ctx.fundamentacao_revisada || ctx.fundamentacao_gerada || '',
      pedidos_revisados: ctx.pedidos_revisados || ctx.pedidos_gerados || '',
      fundamentacao_gerada: ctx.fundamentacao_gerada || '',
      pedidos_gerados: ctx.pedidos_gerados || ''
    });

    this.isReviewModalOpen.set(true);
  }

  handleSaveReviewDraft() {
    const rev = this.reviewingProcess();
    if (!rev) return;

    this.confirmAction('Salvar Rascunho', 'Deseja realmente salvar as alterações manuais feitas nesta peça?', () => {
      this.reviewMsg.set(null);

      const payload = {
        cliente: rev.cliente,
        juizo: rev.juizo,
        tipo_peca: rev.tipo_peca,
        resumo_fatos: rev.resumo_fatos,
        teses_principais: rev.teses_principais,
        materia: rev.materia,
        data_prazo: rev.data_prazo || null,
        fundamentacao_revisada: rev.fundamentacao_revisada,
        pedidos_revisados: rev.pedidos_revisados,
        status: rev.status
      };

      this.http
        .put<any>(`${API_URL}/processos/${rev.id}`, payload, { headers: this.headers })
        .subscribe({
          next: () => {
            this.reviewMsg.set({ type: 'success', text: 'Rascunho salvo com sucesso!' });
            this.fetchProcessos();
          },
          error: (err) => {
            this.reviewMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao salvar rascunho.' });
          }
        });
    });
  }

  handleReprocessProcess() {
    const rev = this.reviewingProcess();
    if (!rev) return;

    this.confirmAction(
      'Regerar com IA',
      'Deseja descartar a redação atual e regerar esta peça usando a Inteligência Artificial novamente?',
      () => {
        this.reviewMsg.set(null);
        this.processingMessage.set('Regerando petição com IA e dados RAG...');

        const savePayload = {
          cliente: rev.cliente,
          juizo: rev.juizo,
          tipo_peca: rev.tipo_peca,
          resumo_fatos: rev.resumo_fatos,
          teses_principais: rev.teses_principais,
          materia: rev.materia,
          data_prazo: rev.data_prazo || null,
          fundamentacao_revisada: rev.fundamentacao_revisada,
          pedidos_revisados: rev.pedidos_revisados,
          status: rev.status
        };

        this.http
          .put<any>(`${API_URL}/processos/${rev.id}`, savePayload, { headers: this.headers })
          .subscribe({
            next: () => {
              this.http
                .post<any>(`${API_URL}/processos/${rev.id}/reprocessar`, {}, { headers: this.headers })
                .subscribe({
                  next: () => {
                    this.reviewMsg.set({
                      type: 'success',
                      text: 'Geração com IA iniciada! Pode fechar este modal; o status será atualizado na fila.'
                    });
                    this.isReviewModalOpen.set(false);
                    this.fetchProcessos();
                    this.processingMessage.set(null);
                  },
                  error: (err) => {
                    this.reviewMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao iniciar regeração.' });
                    this.processingMessage.set(null);
                  }
                });
            },
            error: (err) => {
              this.reviewMsg.set({
                type: 'error',
                text: `Erro ao salvar alterações antes de reprocessar: ${err.error?.detail || err.message}`
              });
              this.processingMessage.set(null);
            }
          });
      }
    );
  }

  handleApproveProcess() {
    const rev = this.reviewingProcess();
    if (!rev) return;

    this.confirmAction(
      'Aprovar Peça e Gerar Word',
      'Você revisou o documento e deseja aprová-lo definitivamente? Um arquivo Word será gerado pronto para protocolo.',
      () => {
        this.reviewMsg.set(null);
        this.processingMessage.set('Aprovando petição e gerando documento Word...');

        const payload = {
          fundamentacao_revisada: rev.fundamentacao_revisada,
          pedidos_revisados: rev.pedidos_revisados,
          salvar_rag: this.salvarRag()
        };

        this.http
          .post<any>(`${API_URL}/processos/${rev.id}/aprovar`, payload, { headers: this.headers })
          .subscribe({
            next: () => {
              this.isReviewModalOpen.set(false);
              this.fetchProcessos();
              this.procMsg.set({
                type: 'success',
                text: `Minuta aprovada e gerada com sucesso! Arquivo disponível na fila.`
              });
              this.processingMessage.set(null);
            },
            error: (err) => {
              this.reviewMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao aprovar minuta.' });
              this.processingMessage.set(null);
            }
          });
      }
    );
  }

  // File download methods
  handleDownloadPDF(processoId: number) {
    if (!processoId) return;
    this.reviewMsg.set(null);
    this.processingMessage.set('Gerando e baixando petição em PDF...');

    this.http
      .get(`${API_URL}/processos/${processoId}/pdf`, {
        headers: this.headers,
        responseType: 'blob',
        observe: 'response'
      })
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (blob) {
            let filename = `Peca_${processoId}.pdf`;
            const contentDisposition = response.headers.get('Content-Disposition');
            if (contentDisposition) {
              const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
              if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
              }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }
          this.processingMessage.set(null);
        },
        error: (err) => {
          console.error(err);
          this.reviewMsg.set({ type: 'error', text: 'Erro ao baixar petição em PDF.' });
          this.processingMessage.set(null);
        }
      });
  }

  handleDownloadDocx(processoId: number) {
    if (!processoId) return;
    this.reviewMsg.set(null);
    this.processingMessage.set('Buscando e baixando petição em Word (.docx)...');

    this.http
      .get(`${API_URL}/processos/${processoId}/docx`, {
        headers: this.headers,
        responseType: 'blob',
        observe: 'response'
      })
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (blob) {
            let filename = `Peca_${processoId}.docx`;
            const contentDisposition = response.headers.get('Content-Disposition');
            if (contentDisposition) {
              const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
              if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
              }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }
          this.processingMessage.set(null);
        },
        error: (err) => {
          console.error(err);
          this.reviewMsg.set({ type: 'error', text: 'Erro ao baixar petição em Word.' });
          this.processingMessage.set(null);
        }
      });
  }

  handleRegenerateDocx(processoId: number) {
    if (!processoId) return;
    this.reviewMsg.set(null);
    this.processingMessage.set('Regerando petição no diretório ativo atual...');

    this.http
      .post<any>(`${API_URL}/processos/${processoId}/regerar-docx`, {}, { headers: this.headers })
      .subscribe({
        next: (data) => {
          this.reviewMsg.set({
            type: 'success',
            text: data.message || 'Petição Word regerada com sucesso!'
          });
          this.fetchProcessos();
          this.processingMessage.set(null);
        },
        error: (err) => {
          this.reviewMsg.set({ type: 'error', text: err.error?.detail || 'Erro ao regerar petição Word.' });
          this.processingMessage.set(null);
        }
      });
  }

  // CSV parsing & upload
  private parseCSV(text: string): any[] {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  }

  handleUploadProcessos(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.confirmAction('Carregar Arquivo', `Deseja carregar a planilha de processos "${file.name}"?`, () => {
      this.csvProcMsg.set(null);
      this.processingMessage.set('Importando processos do arquivo CSV...');

      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const rows = this.parseCSV(e.target.result);
          if (rows.length === 0) {
            this.csvProcMsg.set({ type: 'error', text: 'Planilha vazia ou em formato incorreto.' });
            this.processingMessage.set(null);
            return;
          }

          let sucessos = 0;
          let erros = 0;
          let pendingRequests = rows.length;

          for (const row of rows) {
            const teses = (row.teses_principais || '')
              .split('|')
              .map((t: string) => t.trim())
              .filter((t: string) => t);

            const payload = {
              numero_processo: row.numero_processo || '',
              cliente: row.nome_cliente || '',
              juizo: row.juizo || 'Juízo Comum',
              tipo_peca: row.tipo_peca || 'Contestação',
              resumo_fatos: row.resumo_fatos || '',
              teses_principais: teses,
              materia: row.materia || 'Geral',
              data_prazo: row.data_prazo || null
            };

            this.http.post<any>(`${API_URL}/processos`, payload, { headers: this.headers }).subscribe({
              next: () => {
                sucessos++;
                pendingRequests--;
                this.checkCSVUploadFinished(pendingRequests, sucessos, erros, event.target);
              },
              error: () => {
                erros++;
                pendingRequests--;
                this.checkCSVUploadFinished(pendingRequests, sucessos, erros, event.target);
              }
            });
          }
        } catch (err: any) {
          this.csvProcMsg.set({ type: 'error', text: `Falha ao processar arquivo: ${err.message}` });
          this.processingMessage.set(null);
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  private checkCSVUploadFinished(pending: number, success: number, error: number, inputElement: any) {
    if (pending === 0) {
      this.csvProcMsg.set({
        type: 'success',
        text: `Carga concluída! Inseridos: ${success} | Duplicados/Erro: ${error}`
      });
      this.fetchProcessos();
      if (inputElement) inputElement.value = '';
      this.processingMessage.set(null);
    }
  }

  handleUploadJurisprudencias(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.confirmAction('Carregar Arquivo', `Deseja carregar a planilha de ementas "${file.name}"?`, () => {
      this.csvJurMsg.set(null);
      this.processingMessage.set('Vetorizando jurisprudências em lote RAG... (Isso pode demorar um pouco)');

      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const rows = this.parseCSV(e.target.result);
          if (rows.length === 0) {
            this.csvJurMsg.set({ type: 'error', text: 'Planilha de ementas vazia ou inválida.' });
            this.processingMessage.set(null);
            return;
          }

          let sucessos = 0;
          let erros = 0;
          let pendingRequests = rows.length;

          for (const row of rows) {
            const payload = {
              ementa: row.ementa || '',
              tribunal: row.tribunal || 'Desconhecido',
              processo: row.processo || 'Sem Número',
              materia: row.materia || 'Geral'
            };

            this.http.post<any>(`${API_URL}/jurisprudencia`, payload, { headers: this.headers }).subscribe({
              next: () => {
                sucessos++;
                pendingRequests--;
                this.checkCSVJurUploadFinished(pendingRequests, sucessos, erros, event.target);
              },
              error: () => {
                erros++;
                pendingRequests--;
                this.checkCSVJurUploadFinished(pendingRequests, sucessos, erros, event.target);
              }
            });
          }
        } catch (err: any) {
          this.csvJurMsg.set({ type: 'error', text: `Falha no processamento: ${err.message}` });
          this.processingMessage.set(null);
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  private checkCSVJurUploadFinished(pending: number, success: number, error: number, inputElement: any) {
    if (pending === 0) {
      this.csvJurMsg.set({
        type: 'success',
        text: `Vetorização concluída! Inseridos: ${success} | Falhas: ${error}`
      });
      this.fetchJurisprudencias();
      if (inputElement) inputElement.value = '';
      this.processingMessage.set(null);
    }
  }

  updateCadastroUserField(field: string, value: any) {
    this.cadastroUser.update(c => ({ ...c, [field]: value }));
  }

  updateEditingUserField(field: string, value: any) {
    this.editingUser.update(c => ({ ...c, [field]: value }));
  }

  updateCadastroJurField(field: string, value: any) {
    this.cadastroJur.update(c => ({ ...c, [field]: value }));
  }

  updateReviewingProcessField(field: string, value: any) {
    this.reviewingProcess.update(r => {
      if (!r) return null;
      return { ...r, [field]: value };
    });
  }

  closeConfirmDialog() {
    this.confirmDialog.update(c => ({ ...c, isOpen: false }));
  }

  prevPage() {
    this.currentPage.update(p => Math.max(1, p - 1));
  }

  nextPage() {
    this.currentPage.update(p => p + 1);
  }

  // Logout wrapper
  logout() {
    this.authService.logout();
  }
}
