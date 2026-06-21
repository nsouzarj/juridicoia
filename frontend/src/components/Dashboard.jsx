import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';

function Dashboard({ token, user, onLogout, theme, toggleTheme }) {
  const [activeTab, setActiveTab] = useState(0);
  const [processos, setProcessos] = useState([]);
  const [jurisprudencias, setJurisprudencias] = useState([]);
  
  // Form states
  const [procIdToProcess, setProcIdToProcess] = useState('');
  const [cadastroJur, setCadastroJur] = useState({ ementa: '', tribunal: '', processo: '', materia: '' });
  const [cadastroUser, setCadastroUser] = useState({ nome: '', email: '', senha: '', cargo: 'advogado' });
  
  // Pastas e seleção em lote
  const [pastas, setPastas] = useState([]);
  const [newPastaCaminho, setNewPastaCaminho] = useState('');
  const [pastaMsg, setPastaMsg] = useState(null);
  const [selectedProcessIds, setSelectedProcessIds] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [isPrecedentModalOpen, setIsPrecedentModalOpen] = useState(false);
  const [editingPrecedent, setEditingPrecedent] = useState(null);
  const [isDeletePrecedentOpen, setIsDeletePrecedentOpen] = useState(false);
  const [deletingPrecedent, setDeletingPrecedent] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState({ id: '', nome: '', email: '', senha: '', cargo: 'advogado' });
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [stats, setStats] = useState({
    total_processos: 0,
    status_counts: {},
    materia_counts: {},
    tipo_peca_counts: {}
  });
  
  // States for Lawyer Review Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewingProcess, setReviewingProcess] = useState(null);
  const [reviewMsg, setReviewMsg] = useState(null);
  const [activeReviewTab, setActiveReviewTab] = useState(0);
  const [salvarRag, setSalvarRag] = useState(true);
  
  // Status messages
  const [procMsg, setProcMsg] = useState(null);
  const [jurMsg, setJurMsg] = useState(null);
  const [userMsg, setUserMsg] = useState(null);
  const [csvProcMsg, setCsvProcMsg] = useState(null);
  const [csvJurMsg, setCsvJurMsg] = useState(null);
  
  // Global processing indicator state
  const [processingMessage, setProcessingMessage] = useState(null);
  
  // Refs for file uploads
  const procFileRef = useRef(null);
  const jurFileRef = useRef(null);

  // Fetch functions
  const fetchProcessos = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/processos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setProcessos(data);
      }
    } catch (err) {
      console.error('Erro ao buscar processos:', err);
    }
  }, [token, onLogout]);

  const fetchJurisprudencias = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/jurisprudencia/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setJurisprudencias(data);
      }
    } catch (err) {
      console.error('Erro ao buscar jurisprudências:', err);
    }
  }, [token, onLogout]);

  const fetchPastas = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pastas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setPastas(data);
      }
    } catch (err) {
      console.error('Erro ao buscar pastas:', err);
    }
  }, [token, onLogout]);

  const fetchMaterias = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/materias`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMaterias(data);
      }
    } catch (err) {
      console.error('Erro ao buscar materias:', err);
    }
  }, [token, onLogout]);

  const fetchUsuarios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/usuarios`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    }
  }, [token, onLogout]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/processos/estatisticas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }, [token, onLogout]);

  // Setup polling for processes status update and dashboard statistics
  useEffect(() => {
    const fetchOnLoad = async () => {
      await fetchProcessos();
      await fetchStats();
      await fetchMaterias();
    };
    fetchOnLoad();
    
    const interval = setInterval(async () => {
      await fetchProcessos();
      await fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchProcessos, fetchStats, fetchMaterias]);

  // Fetch precedents and materias when RAG tab (2) is selected
  useEffect(() => {
    if (activeTab === 2) {
      const loadRAGData = async () => {
        await fetchJurisprudencias();
        await fetchMaterias();
      };
      loadRAGData();
    }
  }, [activeTab, fetchJurisprudencias, fetchMaterias]);

  // Fetch folders and users when Admin tab (3) is selected
  useEffect(() => {
    if (activeTab === 3 && user && user.cargo === 'admin') {
      const loadAdminData = async () => {
        await fetchPastas();
        await fetchUsuarios();
      };
      loadAdminData();
    }
  }, [activeTab, user, fetchPastas, fetchUsuarios]);

  const handleProcessCase = async (e) => {
    e.preventDefault();
    if (!procIdToProcess) return;
    setProcMsg(null);
    setProcessingMessage('Iniciando processamento da petição...');

    try {
      const res = await fetch(`${API_URL}/processos/${procIdToProcess}/processar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProcMsg({ type: 'success', text: 'Processamento iniciado em background! Atualize a página em alguns instantes.' });
        setProcIdToProcess('');
        fetchProcessos();
      } else {
        setProcMsg({ type: 'error', text: data.detail || 'Erro ao processar caso.' });
      }
    } catch (err) {
      setProcMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleCadastroJurisprudencia = async (e) => {
    e.preventDefault();
    const { ementa, tribunal, processo, materia } = cadastroJur;
    if (!ementa || !tribunal || !processo || !materia) {
      setJurMsg({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    setJurMsg(null);

    const url = editingPrecedent 
      ? `${API_URL}/jurisprudencia/${editingPrecedent.id}` 
      : `${API_URL}/jurisprudencia`;
    const method = editingPrecedent ? 'PUT' : 'POST';
    setProcessingMessage(editingPrecedent ? 'Atualizando precedente e recalculando embeddings...' : 'Vetorizando precedente na base de dados...');

    try {
      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(cadastroJur)
      });
      const data = await res.json();
      if (res.ok) {
        setJurMsg({ 
          type: 'success', 
          text: editingPrecedent ? 'Precedente atualizado com sucesso!' : 'Precedente cadastrado com sucesso!' 
        });
        setCadastroJur({ ementa: '', tribunal: '', processo: '', materia: '' });
        setEditingPrecedent(null);
        setIsPrecedentModalOpen(false);
        fetchJurisprudencias();
      } else {
        setJurMsg({ type: 'error', text: data.detail || 'Erro ao salvar precedente.' });
      }
    } catch (err) {
      setJurMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  const openCreatePrecedentModal = () => {
    setJurMsg(null);
    setEditingPrecedent(null);
    setCadastroJur({ ementa: '', tribunal: '', processo: '', materia: '' });
    setIsPrecedentModalOpen(true);
  };

  const openEditPrecedentModal = (precedent) => {
    setJurMsg(null);
    setEditingPrecedent(precedent);
    setCadastroJur({
      ementa: precedent.ementa,
      tribunal: precedent.tribunal || '',
      processo: precedent.processo_referencia || '',
      materia: precedent.materia || ''
    });
    setIsPrecedentModalOpen(true);
  };

  const openDeletePrecedentConfirm = (precedent) => {
    setJurMsg(null);
    setDeletingPrecedent(precedent);
    setIsDeletePrecedentOpen(true);
  };

  const handleDeletePrecedent = async () => {
    if (!deletingPrecedent) return;
    setJurMsg(null);
    setProcessingMessage('Removendo precedente da base de dados...');
    try {
      const res = await fetch(`${API_URL}/jurisprudencia/${deletingPrecedent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setJurMsg({ type: 'success', text: 'Precedente excluído com sucesso!' });
        setIsDeletePrecedentOpen(false);
        setDeletingPrecedent(null);
        fetchJurisprudencias();
      } else {
        setJurMsg({ type: 'error', text: data.detail || 'Erro ao excluir precedente.' });
      }
    } catch (err) {
      setJurMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleCadastroUser = async (e) => {
    e.preventDefault();
    const { nome, email, senha, cargo } = cadastroUser;
    if (!nome || !email || !senha || !cargo) {
      setUserMsg({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    setUserMsg(null);

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(cadastroUser)
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg({ type: 'success', text: `Conta criada com sucesso para ${nome}!` });
        setCadastroUser({ nome: '', email: '', senha: '', cargo: 'advogado' });
        fetchUsuarios();
      } else {
        setUserMsg({ type: 'error', text: data.detail || 'Erro ao registrar usuário.' });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const openEditModal = (userToEdit) => {
    setUserMsg(null);
    setEditingUser({
      id: userToEdit.id,
      nome: userToEdit.nome,
      email: userToEdit.email,
      senha: '',
      cargo: userToEdit.cargo
    });
    setIsEditUserModalOpen(true);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    const { id, nome, email, senha, cargo } = editingUser;
    if (!nome || !email || !cargo) {
      setUserMsg({ type: 'error', text: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    setUserMsg(null);

    try {
      const res = await fetch(`${API_URL}/admin/usuarios/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nome, email, senha: senha || null, cargo })
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg({ type: 'success', text: `Usuário ${nome} atualizado com sucesso!` });
        setIsEditUserModalOpen(false);
        fetchUsuarios();
      } else {
        setUserMsg({ type: 'error', text: data.detail || 'Erro ao editar usuário.' });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const openDeleteConfirm = (userToDelete) => {
    setUserMsg(null);
    setDeletingUser(userToDelete);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setUserMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/usuarios/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg({ type: 'success', text: `Usuário ${deletingUser.nome} excluído com sucesso!` });
        setIsDeleteConfirmOpen(false);
        setDeletingUser(null);
        fetchUsuarios();
      } else {
        setUserMsg({ type: 'error', text: data.detail || 'Erro ao excluir usuário.' });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const handleCadastroPasta = async (e) => {
    e.preventDefault();
    if (!newPastaCaminho) {
      setPastaMsg({ type: 'error', text: 'Preencha o caminho da pasta.' });
      return;
    }
    setPastaMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/pastas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ caminho: newPastaCaminho })
      });
      const data = await res.json();
      if (res.ok) {
        setPastaMsg({ type: 'success', text: 'Pasta cadastrada com sucesso!' });
        setNewPastaCaminho('');
        fetchPastas();
      } else {
        setPastaMsg({ type: 'error', text: data.detail || 'Erro ao cadastrar pasta.' });
      }
    } catch (err) {
      setPastaMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const handleAtivarPasta = async (pastaId) => {
    setPastaMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/pastas/${pastaId}/ativar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPastaMsg({ type: 'success', text: 'Pasta ativada com sucesso!' });
        fetchPastas();
      } else {
        setPastaMsg({ type: 'error', text: data.detail || 'Erro ao ativar pasta.' });
      }
    } catch (err) {
      setPastaMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const handleExcluirPasta = async (pastaId) => {
    setPastaMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/pastas/${pastaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPastaMsg({ type: 'success', text: 'Pasta removida com sucesso!' });
        fetchPastas();
      } else {
        setPastaMsg({ type: 'error', text: data.detail || 'Erro ao excluir pasta.' });
      }
    } catch (err) {
      setPastaMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const handleSelectProcess = (id) => {
    setSelectedProcessIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const checkableProcessos = processos.filter(
    p => p.status === 'PENDENTE' || p.status === 'ERRO_PROCESSAMENTO'
  );
  
  const isAllSelected = checkableProcessos.length > 0 && 
    checkableProcessos.every(p => selectedProcessIds.includes(p.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      const checkableIds = checkableProcessos.map(p => p.id);
      setSelectedProcessIds(prev => prev.filter(id => !checkableIds.includes(id)));
    } else {
      const checkableIds = checkableProcessos.map(p => p.id);
      setSelectedProcessIds(prev => {
        const unique = new Set([...prev, ...checkableIds]);
        return Array.from(unique);
      });
    }
  };

  const handleBatchProcess = async () => {
    if (selectedProcessIds.length === 0) return;
    setProcMsg(null);
    setProcessingMessage('Iniciando processamento em lote...');
    try {
      const res = await fetch(`${API_URL}/processos/processar-lote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedProcessIds })
      });
      const data = await res.json();
      if (res.ok) {
        setProcMsg({ 
          type: 'success', 
          text: data.message || 'Processamento em lote iniciado em segundo plano!' 
        });
        setSelectedProcessIds([]);
        fetchProcessos();
      } else {
        setProcMsg({ type: 'error', text: data.detail || 'Erro ao processar lote.' });
      }
    } catch (err) {
      setProcMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleOpenReviewModal = (processo) => {
    setReviewMsg(null);
    setActiveReviewTab(0);
    setSalvarRag(true);
    
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
    
    let teses = [];
    if (ctx.teses_principais) {
      if (Array.isArray(ctx.teses_principais)) {
        teses = [...ctx.teses_principais];
      } else if (typeof ctx.teses_principais === 'string') {
        teses = ctx.teses_principais.split('\n').map(t => t.trim()).filter(t => t);
      }
    }
    
    setReviewingProcess({
      id: processo.id,
      numero_processo: processo.numero_processo || '',
      cliente: processo.cliente || '',
      status: processo.status || '',
      juizo: ctx.juizo || '',
      tipo_peca: ctx.tipo_peca || 'Contestação',
      resumo_fatos: ctx.resumo_fatos || '',
      teses_principais: teses,
      materia: ctx.materia || 'Geral',
      data_prazo: processo.data_prazo || '',
      fundamentacao_revisada: ctx.fundamentacao_revisada || ctx.fundamentacao_gerada || '',
      pedidos_revisados: ctx.pedidos_revisados || ctx.pedidos_gerados || '',
      fundamentacao_gerada: ctx.fundamentacao_gerada || '',
      pedidos_gerados: ctx.pedidos_gerados || '',
    });
    setIsReviewModalOpen(true);
  };

  const handleSaveReviewDraft = async () => {
    if (!reviewingProcess) return;
    setReviewMsg(null);
    try {
      const res = await fetch(`${API_URL}/processos/${reviewingProcess.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente: reviewingProcess.cliente,
          juizo: reviewingProcess.juizo,
          tipo_peca: reviewingProcess.tipo_peca,
          resumo_fatos: reviewingProcess.resumo_fatos,
          teses_principais: reviewingProcess.teses_principais,
          materia: reviewingProcess.materia,
          data_prazo: reviewingProcess.data_prazo || null,
          fundamentacao_revisada: reviewingProcess.fundamentacao_revisada,
          pedidos_revisados: reviewingProcess.pedidos_revisados,
          status: reviewingProcess.status
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReviewMsg({ type: 'success', text: 'Rascunho salvo com sucesso!' });
        fetchProcessos();
      } else {
        setReviewMsg({ type: 'error', text: data.detail || 'Erro ao salvar rascunho.' });
      }
    } catch (err) {
      setReviewMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    }
  };

  const handleReprocessProcess = async () => {
    if (!reviewingProcess) return;
    setReviewMsg(null);
    setProcessingMessage('Regerando petição com IA e dados RAG...');
    try {
      const saveRes = await fetch(`${API_URL}/processos/${reviewingProcess.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente: reviewingProcess.cliente,
          juizo: reviewingProcess.juizo,
          tipo_peca: reviewingProcess.tipo_peca,
          resumo_fatos: reviewingProcess.resumo_fatos,
          teses_principais: reviewingProcess.teses_principais,
          materia: reviewingProcess.materia,
          data_prazo: reviewingProcess.data_prazo || null,
          fundamentacao_revisada: reviewingProcess.fundamentacao_revisada,
          pedidos_revisados: reviewingProcess.pedidos_revisados,
          status: reviewingProcess.status
        })
      });
      
      if (!saveRes.ok) {
        const errData = await saveRes.json();
        setReviewMsg({ type: 'error', text: `Erro ao salvar alterações antes de reprocessar: ${errData.detail}` });
        setProcessingMessage(null);
        return;
      }
      
      const res = await fetch(`${API_URL}/processos/${reviewingProcess.id}/reprocessar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setReviewMsg({ type: 'success', text: 'Geração com IA iniciada! Pode fechar este modal; o status será atualizado na fila.' });
        setIsReviewModalOpen(false);
        fetchProcessos();
      } else {
        setReviewMsg({ type: 'error', text: data.detail || 'Erro ao iniciar regeração.' });
      }
    } catch (err) {
      setReviewMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleApproveProcess = async () => {
    if (!reviewingProcess) return;
    setReviewMsg(null);
    setProcessingMessage('Aprovando petição e gerando documento Word...');
    try {
      const res = await fetch(`${API_URL}/processos/${reviewingProcess.id}/aprovar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fundamentacao_revisada: reviewingProcess.fundamentacao_revisada,
          pedidos_revisados: reviewingProcess.pedidos_revisados,
          salvar_rag: salvarRag
        })
      });
      const data = await res.json();
      if (res.ok) {
        setIsReviewModalOpen(false);
        fetchProcessos();
        setProcMsg({ type: 'success', text: `Minuta aprovada e gerada com sucesso! RAG atualizado.` });
      } else {
        setReviewMsg({ type: 'error', text: data.detail || 'Erro ao aprovar minuta.' });
      }
    } catch (err) {
      setReviewMsg({ type: 'error', text: `Erro de rede: ${err.message}` });
    } finally {
      setProcessingMessage(null);
    }
  };

  // Helper function to parse CSV text split by semicolon
  const parseCSV = (text) => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  };

  const handleUploadProcessos = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvProcMsg(null);
    setProcessingMessage('Importando processos do arquivo CSV...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rows = parseCSV(event.target.result);
        if (rows.length === 0) {
          setCsvProcMsg({ type: 'error', text: 'Planilha vazia ou em formato incorreto.' });
          setProcessingMessage(null);
          return;
        }

        let sucessos = 0;
        let erros = 0;

        for (const row of rows) {
          const teses = (row.teses_principais || '')
            .split(';')
            .map(t => t.trim())
            .filter(t => t);

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

          const res = await fetch(`${API_URL}/processos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (res.status === 201) sucessos++;
          else erros++;
        }

        setCsvProcMsg({ type: 'success', text: `Carga concluída! Inseridos: ${sucessos} | Duplicados/Erro: ${erros}` });
        fetchProcessos();
        if (procFileRef.current) procFileRef.current.value = '';
      } catch (err) {
        setCsvProcMsg({ type: 'error', text: `Falha ao processar arquivo: ${err.message}` });
      } finally {
        setProcessingMessage(null);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleUploadJurisprudencias = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvJurMsg(null);
    setProcessingMessage('Vetorizando jurisprudências em lote RAG... (Isso pode demorar um pouco)');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rows = parseCSV(event.target.result);
        if (rows.length === 0) {
          setCsvJurMsg({ type: 'error', text: 'Planilha de ementas vazia ou inválida.' });
          setProcessingMessage(null);
          return;
        }

        let sucessos = 0;
        let erros = 0;

        for (const row of rows) {
          const payload = {
            ementa: row.ementa || '',
            tribunal: row.tribunal || 'Desconhecido',
            processo: row.processo || 'Sem Número',
            materia: row.materia || 'Geral'
          };

          const res = await fetch(`${API_URL}/jurisprudencia`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (res.status === 201) sucessos++;
          else erros++;
        }

        setCsvJurMsg({ type: 'success', text: `Vetorização concluída! Inseridos: ${sucessos} | Falhas: ${erros}` });
        fetchJurisprudencias();
        if (jurFileRef.current) jurFileRef.current.value = '';
      } catch (err) {
        setCsvJurMsg({ type: 'error', text: `Falha no processamento: ${err.message}` });
      } finally {
        setProcessingMessage(null);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDENTE': return <span className="badge badge-pending">Pendente</span>;
      case 'PROCESSANDO': return <span className="badge badge-processing">Processando</span>;
      case 'REVISAO': return <span className="badge badge-review">Revisão</span>;
      case 'ERRO_PROCESSAMENTO': return <span className="badge badge-error">Erro</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Section */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand font-cinzel">PRAXIS</div>
          {user && (
            <div className="sidebar-profile">
              <div>
                <div className="profile-title">Operador</div>
                <div className="profile-val">{user.nome}</div>
              </div>
              <div>
                <div className="profile-title">Perfil</div>
                <div className="profile-role">{user.cargo}</div>
              </div>
              <div>
                <div className="profile-title">E-mail</div>
                <div className="profile-val" style={{ wordBreak: 'break-all', fontSize: '12px' }}>{user.email}</div>
              </div>
            </div>
          )}
        </div>
        <button onClick={onLogout} className="btn btn-secondary" style={{ width: '100%' }}>
          🚪 LOGOUT
        </button>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <div className="header-row">
          <h1 className="logo-text">P R A X I S // AUTOMAÇÃO</h1>
          <button 
            onClick={toggleTheme} 
            className="btn btn-secondary" 
            style={{ 
              margin: 0, 
              padding: '8px 16px', 
              fontSize: '12px' 
            }}
          >
            {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>
        </div>

        {/* Tab Headers */}
        <div className="tabs-header">
          <button onClick={() => setActiveTab(0)} className={`tab-btn ${activeTab === 0 ? 'active' : ''}`}>📊 PAINEL</button>
          <button onClick={() => setActiveTab(1)} className={`tab-btn ${activeTab === 1 ? 'active' : ''}`}>⚖️ FILA DE PEÇAS</button>
          <button onClick={() => setActiveTab(2)} className={`tab-btn ${activeTab === 2 ? 'active' : ''}`}>📚 COFRE RAG</button>
          {user && user.cargo === 'admin' && (
            <button onClick={() => setActiveTab(3)} className={`tab-btn ${activeTab === 3 ? 'active' : ''}`}>⚙️ ADMIN</button>
          )}
        </div>

        {/* Tab contents */}
        {activeTab === 0 && (
          <div className="section">
            <h2 className="font-cinzel">Painel de Controle e Estatísticas</h2>
            
            {/* Metric Summary Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '30px'
            }}>
              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: '100%', backgroundColor: 'var(--gold)' }} />
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>Total de Processos</span>
                <span style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '10px', fontFamily: 'Outfit, sans-serif' }}>{stats.total_processos}</span>
              </div>

              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: '100%', backgroundColor: 'var(--pending, #e67e22)' }} />
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>Pendentes</span>
                <span style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '10px', fontFamily: 'Outfit, sans-serif' }}>{stats.status_counts.PENDENTE || 0}</span>
              </div>

              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: '100%', backgroundColor: 'var(--processing, #3498db)' }} />
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>Em Andamento</span>
                <span style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '10px', fontFamily: 'Outfit, sans-serif' }}>{stats.status_counts.PROCESSANDO || 0}</span>
              </div>

              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', width: '100%', backgroundColor: 'var(--review, #2ecc71)' }} />
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>Em Revisão</span>
                <span style={{ fontSize: '36px', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '10px', fontFamily: 'Outfit, sans-serif' }}>{stats.status_counts.REVISAO || 0}</span>
              </div>
            </div>

            {/* Dashboard Graphs Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '30px'
            }}>
              {/* Status Circle Donut Graph Card */}
              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '25px'
              }}>
                <h3 className="font-cinzel" style={{ fontSize: '16px', marginBottom: '20px', letterSpacing: '1px' }}>Fases da Fila (Status)</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '20px' }}>
                  {/* SVG Circle Render */}
                  <div style={{ width: '130px', height: '130px', position: 'relative' }}>
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                      {/* Background placeholder track */}
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                      
                      {(() => {
                        const total = stats.total_processos || 0;
                        const p = stats.status_counts.PENDENTE || 0;
                        const pr = stats.status_counts.PROCESSANDO || 0;
                        const rev = stats.status_counts.REVISAO || 0;
                        const err = stats.status_counts.ERRO_PROCESSAMENTO || 0;

                        const circ = 2 * Math.PI * 40; // 251.32
                        
                        const pPct = total > 0 ? (p / total) * circ : 0;
                        const prPct = total > 0 ? (pr / total) * circ : 0;
                        const revPct = total > 0 ? (rev / total) * circ : 0;
                        const errPct = total > 0 ? (err / total) * circ : 0;

                        // Cumulative offsets
                        const pOffset = 0;
                        const prOffset = -pPct;
                        const revOffset = prOffset - prPct;
                        const errOffset = revOffset - revPct;

                        return (
                          <>
                            {/* PENDENTE */}
                            {pPct > 0 && (
                              <circle 
                                cx="50" cy="50" r="40" 
                                fill="transparent" 
                                stroke="#e67e22" 
                                strokeWidth="8" 
                                strokeDasharray={`${pPct} ${circ}`} 
                                strokeDashoffset={pOffset} 
                                transform="rotate(-90 50 50)"
                              />
                            )}
                            {/* PROCESSANDO */}
                            {prPct > 0 && (
                              <circle 
                                cx="50" cy="50" r="40" 
                                fill="transparent" 
                                stroke="#3498db" 
                                strokeWidth="8" 
                                strokeDasharray={`${prPct} ${circ}`} 
                                strokeDashoffset={prOffset} 
                                transform="rotate(-90 50 50)"
                              />
                            )}
                            {/* REVISAO */}
                            {revPct > 0 && (
                              <circle 
                                cx="50" cy="50" r="40" 
                                fill="transparent" 
                                stroke="#2ecc71" 
                                strokeWidth="8" 
                                strokeDasharray={`${revPct} ${circ}`} 
                                strokeDashoffset={revOffset} 
                                transform="rotate(-90 50 50)"
                              />
                            )}
                            {/* ERRO_PROCESSAMENTO */}
                            {errPct > 0 && (
                              <circle 
                                cx="50" cy="50" r="40" 
                                fill="transparent" 
                                stroke="#e74c3c" 
                                strokeWidth="8" 
                                strokeDasharray={`${errPct} ${circ}`} 
                                strokeDashoffset={errOffset} 
                                transform="rotate(-90 50 50)"
                              />
                            )}
                          </>
                        );
                      })()}

                      {/* Text in the middle */}
                      <text x="50" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="14px" fontWeight="bold" dominantBaseline="middle" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {stats.total_processos}
                      </text>
                      <text x="50" y="62" textAnchor="middle" fill="var(--text-secondary)" fontSize="7px" fontWeight="bold" dominantBaseline="middle" style={{ letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        Minutas
                      </text>
                    </svg>
                  </div>

                  {/* Legend list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#e67e22' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Pendentes:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{stats.status_counts.PENDENTE || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#3498db' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Em Processo:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{stats.status_counts.PROCESSANDO || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#2ecc71' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Revisão:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{stats.status_counts.REVISAO || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#e74c3c' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Falhas:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{stats.status_counts.ERRO_PROCESSAMENTO || 0}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Materias volume horizontal chart */}
              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '25px'
              }}>
                <h3 className="font-cinzel" style={{ fontSize: '16px', marginBottom: '20px', letterSpacing: '1px' }}>Casos por Matéria Jurídica</h3>
                
                <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                  {Object.keys(stats.materia_counts).length > 0 ? (
                    Object.entries(stats.materia_counts).map(([materia, count]) => {
                      const maxVal = Math.max(...Object.values(stats.materia_counts), 1);
                      const percent = (count / maxVal) * 100;
                      return (
                        <div key={materia} style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{materia}</span>
                            <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{count} {count === 1 ? 'caso' : 'casos'}</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, var(--gold) 0%, var(--gold-hover) 100%)',
                              borderRadius: '3px',
                              transition: 'width 0.8s ease-out'
                            }} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: 'flex', height: '100px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Nenhum caso indexado.
                    </div>
                  )}
                </div>
              </div>

              {/* Piece Types volume chart */}
              <div style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                padding: '25px'
              }}>
                <h3 className="font-cinzel" style={{ fontSize: '16px', marginBottom: '20px', letterSpacing: '1px' }}>Tipo de Petição (Minutas)</h3>
                
                <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                  {Object.keys(stats.tipo_peca_counts).length > 0 ? (
                    Object.entries(stats.tipo_peca_counts).map(([peca, count]) => {
                      const maxVal = Math.max(...Object.values(stats.tipo_peca_counts), 1);
                      const percent = (count / maxVal) * 100;
                      return (
                        <div key={peca} style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{peca}</span>
                            <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{count} {count === 1 ? 'peça' : 'peças'}</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, var(--bronze, #cd7f32) 0%, var(--gold) 100%)',
                              borderRadius: '3px',
                              transition: 'width 0.8s ease-out'
                            }} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: 'flex', height: '100px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Nenhuma minuta gerada.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="section">
            <h2 className="font-cinzel">Fila de Casos (Urgência por Prazo)</h2>

            {selectedProcessIds.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '12px 20px',
                borderRadius: '6px',
                marginBottom: '15px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <strong>{selectedProcessIds.length}</strong> {selectedProcessIds.length === 1 ? 'processo selecionado' : 'processos selecionados'}
                </span>
                <button 
                  onClick={handleBatchProcess} 
                  className="btn btn-primary"
                  style={{ margin: 0, padding: '8px 16px', fontSize: '13px' }}
                >
                  🚀 Processar Lote Selecionado
                </button>
              </div>
            )}

            <div className="table-container">
              {processos.length > 0 ? (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isAllSelected} 
                          onChange={handleSelectAll}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th>ID</th>
                      <th>Processo</th>
                      <th>Cliente</th>
                      <th>Status</th>
                      <th>Prazo Limite</th>
                      <th>Matéria</th>
                      <th>Tipo de Peça</th>
                      <th style={{ width: '120px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processos.map((p) => {
                      const canSelect = p.status === 'PENDENTE' || p.status === 'ERRO_PROCESSAMENTO';
                      return (
                        <tr key={p.id}>
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox"
                              disabled={!canSelect}
                              checked={selectedProcessIds.includes(p.id)}
                              onChange={() => handleSelectProcess(p.id)}
                              style={{ cursor: canSelect ? 'pointer' : 'not-allowed' }}
                            />
                          </td>
                          <td>{p.id}</td>
                          <td>{p.numero_processo}</td>
                          <td>{p.cliente}</td>
                          <td>{getStatusBadge(p.status)}</td>
                          <td>{p.data_prazo || 'Sem Prazo'}</td>
                          <td>{p.contexto_dinamico?.materia || 'Geral'}</td>
                          <td>{p.contexto_dinamico?.tipo_peca || 'Contestação'}</td>
                          <td>
                            {p.status === 'REVISAO' || p.status === 'PROTOCOLADO' ? (
                              <button
                                onClick={() => handleOpenReviewModal(p)}
                                className="btn btn-primary"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '12px' }}
                              >
                                {p.status === 'REVISAO' ? '🔎 Revisar' : '👁️ Ver'}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Nenhum processo pendente na fila.
                </div>
              )}
            </div>

            <div className="sub-section">
              <h3 className="font-cinzel">Acionar Geração de Minuta com RAG</h3>
              <form onSubmit={handleProcessCase} className="form-grid" style={{ alignItems: 'flex-end' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="proc-id">Digite o ID do Processo:</label>
                  <input
                    id="proc-id"
                    type="number"
                    className="form-input"
                    placeholder="Ex: 1"
                    value={procIdToProcess}
                    onChange={(e) => setProcIdToProcess(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary">🚀 Processar Caso</button>
              </form>
              {procMsg && <div className={`alert alert-${procMsg.type}`} style={{ marginTop: '10px' }}>{procMsg.text}</div>}
            </div>

            <div className="sub-section">
              <h3 className="font-cinzel">Cadastrar Novos Casos na Fila via CSV</h3>
              <div className="file-uploader">
                <span className="upload-icon">📥</span>
                <p className="upload-text"><strong>Selecione a planilha de processos</strong> ou arraste o arquivo .CSV</p>
                <input
                  ref={procFileRef}
                  type="file"
                  accept=".csv"
                  className="file-input"
                  onChange={handleUploadProcessos}
                />
              </div>
              {csvProcMsg && <div className={`alert alert-${csvProcMsg.type}`}>{csvProcMsg.text}</div>}
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="font-cinzel" style={{ margin: 0 }}>Banco de Precedentes (Cofre RAG)</h2>
              <button 
                className="btn btn-primary" 
                onClick={openCreatePrecedentModal}
              >
                ➕ Cadastrar Precedente
              </button>
            </div>

            {jurMsg && <div className={`alert alert-${jurMsg.type}`} style={{ margin: '15px 0' }}>{jurMsg.text}</div>}

            <div className="cards-layout">
              <div className="accent-line-col"></div>
              <div className="cards-container">
                {jurisprudencias.map((jur) => (
                  <article key={jur.id} className="precedent-card">
                    <h3 className="card-title">{jur.ementa.substring(0, 80).trim()}...</h3>
                    <p className="card-snippet">{jur.ementa.substring(80, 200).trim()}...</p>
                    <ul className="card-meta">
                      <li><strong>Tribunal:</strong> {jur.tribunal}</li>
                      <li><strong>Processo:</strong> {jur.processo_referencia}</li>
                      <li><strong>Matéria:</strong> {jur.materia}</li>
                    </ul>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => openEditPrecedentModal(jur)}
                        className="btn btn-primary"
                        style={{ margin: 0, padding: '4px 8px', fontSize: '11px' }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeletePrecedentConfirm(jur)}
                        className="btn btn-secondary"
                        style={{ margin: 0, padding: '4px 8px', fontSize: '11px', borderColor: 'var(--error)', color: 'var(--error)' }}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* Modal de Cadastro de Precedente */}
            {isPrecedentModalOpen && (
              <div className="modal-overlay" onClick={() => { setIsPrecedentModalOpen(false); setEditingPrecedent(null); }}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 className="modal-title font-cinzel">{editingPrecedent ? '✏️ Editar Precedente' : '➕ Cadastrar Novo Precedente'}</h3>
                    <button className="modal-close-btn" onClick={() => { setIsPrecedentModalOpen(false); setEditingPrecedent(null); }}>✕</button>
                  </div>
                  <form onSubmit={handleCadastroJurisprudencia} className="form-group" style={{ gap: '15px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ementa">Ementa Completa do Julgado</label>
                      <textarea
                        id="ementa"
                        className="form-input"
                        rows="6"
                        placeholder="Transcreva a ementa completa..."
                        value={cadastroJur.ementa}
                        onChange={(e) => setCadastroJur({ ...cadastroJur, ementa: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="tribunal">Tribunal</label>
                        <input
                          id="tribunal"
                          className="form-input"
                          placeholder="Ex: STJ"
                          value={cadastroJur.tribunal}
                          onChange={(e) => setCadastroJur({ ...cadastroJur, tribunal: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="processo">Processo de Referência</label>
                        <input
                          id="processo"
                          className="form-input"
                          placeholder="Ex: REsp 123456"
                          value={cadastroJur.processo}
                          onChange={(e) => setCadastroJur({ ...cadastroJur, processo: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="materia">Matéria Jurídica</label>
                      <select
                        id="materia"
                        className="form-input"
                        value={cadastroJur.materia}
                        onChange={(e) => setCadastroJur({ ...cadastroJur, materia: e.target.value })}
                        required
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="">Selecione uma matéria...</option>
                        <option value="Geral">Geral</option>
                        {materias.map((m) => (
                          <option key={m.id} value={m.nome}>{m.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => { setIsPrecedentModalOpen(false); setEditingPrecedent(null); }}>Cancelar</button>
                      <button type="submit" className="btn btn-primary">{editingPrecedent ? '💾 Salvar Alterações' : '💾 Gravar Precedente'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal de Confirmação de Exclusão de Precedente */}
            {isDeletePrecedentOpen && deletingPrecedent && (
              <div className="modal-overlay" onClick={() => setIsDeletePrecedentOpen(false)}>
                <div className="modal-content" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 className="modal-title font-cinzel" style={{ color: 'var(--error)' }}>⚠️ Confirmar Exclusão</h3>
                    <button className="modal-close-btn" onClick={() => setIsDeletePrecedentOpen(false)}>✕</button>
                  </div>
                  <div style={{ padding: '15px 0', color: 'var(--text-primary)' }}>
                    <p>Você tem certeza que deseja excluir o precedente com a ementa iniciada em: <strong>"{deletingPrecedent.ementa.substring(0, 50)}..."</strong>?</p>
                    <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>Esta ação é irreversível e removerá permanentemente o vetor de busca do RAG.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsDeletePrecedentOpen(false)}>Cancelar</button>
                    <button type="button" className="btn btn-secondary" style={{ borderColor: 'var(--error)', color: 'var(--error)' }} onClick={handleDeletePrecedent}>🗑️ Confirmar Exclusão</button>
                  </div>
                </div>
              </div>
            )}

            <div className="sub-section" style={{ marginTop: '30px' }}>
              <h3 className="font-cinzel">📚 Matérias Jurídicas Cadastradas</h3>
              {materias.length > 0 ? (
                <div className="materias-grid">
                  {materias.map((mat) => (
                    <div key={mat.id} className="materia-card">
                      <h4 className="materia-nome">{mat.nome}</h4>
                      <p className="materia-desc">{mat.descricao}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
                  Nenhuma matéria jurídica cadastrada.
                </div>
              )}
            </div>

            <div className="sub-section">
              <h3 className="font-cinzel">Importar Jurisprudências em Lote (.CSV)</h3>
              <div className="file-uploader">
                <span className="upload-icon">⚡</span>
                <p className="upload-text"><strong>Selecione a planilha de ementas</strong> ou arraste o arquivo .CSV</p>
                <input
                  ref={jurFileRef}
                  type="file"
                  accept=".csv"
                  className="file-input"
                  onChange={handleUploadJurisprudencias}
                />
              </div>
              {csvJurMsg && <div className={`alert alert-${csvJurMsg.type}`}>{csvJurMsg.text}</div>}
            </div>
          </div>
        )}

        {activeTab === 3 && user && user.cargo === 'admin' && (
          <div className="section">
            <h2 className="font-cinzel">Cadastrar Nova Conta de Funcionário</h2>

            <div className="sub-section">
              <form onSubmit={handleCadastroUser} className="form-group" style={{ gap: '15px' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="nome">Nome do Operador</label>
                    <input
                      id="nome"
                      className="form-input"
                      value={cadastroUser.nome}
                      onChange={(e) => setCadastroUser({ ...cadastroUser, nome: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="email-nov">E-mail Corporativo</label>
                    <input
                      id="email-nov"
                      type="email"
                      className="form-input"
                      value={cadastroUser.email}
                      onChange={(e) => setCadastroUser({ ...cadastroUser, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="senha-nov">Senha Inicial</label>
                    <input
                      id="senha-nov"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      className="form-input"
                      value={cadastroUser.senha}
                      onChange={(e) => setCadastroUser({ ...cadastroUser, senha: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cargo">Perfil de Acesso</label>
                    <select
                      id="cargo"
                      className="form-input"
                      value={cadastroUser.cargo}
                      onChange={(e) => setCadastroUser({ ...cadastroUser, cargo: e.target.value })}
                    >
                      <option value="advogado">Advogado</option>
                      <option value="revisor">Revisor</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }}>👥 Cadastrar Operador</button>
              </form>
              {userMsg && <div className={`alert alert-${userMsg.type}`}>{userMsg.text}</div>}
            </div>

            <div className="sub-section" style={{ marginTop: '20px' }}>
              <h3 className="font-cinzel">👥 Funcionários Cadastrados</h3>
              <div className="table-container">
                {usuarios.length > 0 ? (
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nome</th>
                        <th>E-mail</th>
                        <th>Perfil/Cargo</th>
                        <th>Data de Cadastro</th>
                        <th style={{ width: '160px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map((u) => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{u.nome} {u.email === user?.email && <span style={{ color: 'var(--gold)', fontSize: '12px', fontWeight: 'bold' }}>(Você)</span>}</td>
                          <td>{u.email}</td>
                          <td>
                            <span className="badge badge-processing" style={{ textTransform: 'uppercase' }}>
                              {u.cargo}
                            </span>
                          </td>
                          <td>{new Date(u.data_criacao).toLocaleDateString('pt-BR')}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                onClick={() => openEditModal(u)} 
                                className="btn btn-primary"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '12px' }}
                              >
                                ✏️ Editar
                              </button>
                              {u.email !== user?.email ? (
                                <button 
                                  onClick={() => openDeleteConfirm(u)} 
                                  className="btn btn-secondary"
                                  style={{ margin: 0, padding: '4px 8px', fontSize: '12px', borderColor: 'var(--error)', color: 'var(--error)' }}
                                >
                                  🗑️ Excluir
                                </button>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center', opacity: 0.7 }}>
                                  -
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhum funcionário cadastrado.
                  </div>
                )}
              </div>
            </div>

            <div className="sub-section" style={{ marginTop: '30px' }}>
              <h3 className="font-cinzel">⚙️ Gerenciamento de Pastas de Saída Externas</h3>
              <form onSubmit={handleCadastroPasta} className="form-group" style={{ gap: '15px', marginBottom: '20px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-pasta-caminho">Caminho Absoluto da Pasta</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      id="new-pasta-caminho"
                      type="text"
                      className="form-input"
                      placeholder="Ex: D:/Processos/ ou C:/Clientes/"
                      value={newPastaCaminho}
                      onChange={(e) => setNewPastaCaminho(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-primary" style={{ margin: 0 }}>📁 Cadastrar Pasta</button>
                  </div>
                  <small style={{ color: 'var(--text-secondary)', marginTop: '5px', display: 'block' }}>
                    Nota: O backend testará permissão de escrita antes de salvar o caminho.
                  </small>
                </div>
              </form>
              {pastaMsg && <div className={`alert alert-${pastaMsg.type}`} style={{ marginBottom: '20px' }}>{pastaMsg.text}</div>}

              <div className="table-container">
                {pastas.length > 0 ? (
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Caminho</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastas.map((pasta) => (
                        <tr key={pasta.id}>
                          <td style={{ wordBreak: 'break-all' }}>{pasta.caminho}</td>
                          <td>
                            {pasta.ativo ? (
                              <span className="badge badge-processing">ATIVA</span>
                            ) : (
                              <span className="badge badge-pending">Inativa</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {!pasta.ativo && (
                              <button 
                                onClick={() => handleAtivarPasta(pasta.id)} 
                                className="btn btn-primary"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '12px' }}
                              >
                                Ativar
                              </button>
                            )}
                            <button 
                              onClick={() => handleExcluirPasta(pasta.id)} 
                              className="btn btn-secondary"
                              style={{ margin: 0, padding: '4px 8px', fontSize: '12px', borderColor: 'var(--error)', color: 'var(--error)' }}
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhuma pasta de saída configurada. O sistema usará a pasta padrão local.
                  </div>
                )}
              </div>
            </div>

            {/* Modal de Edição de Operador */}
            {isEditUserModalOpen && (
              <div className="modal-overlay" onClick={() => setIsEditUserModalOpen(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 className="modal-title font-cinzel">✏️ Editar Operador</h3>
                    <button className="modal-close-btn" onClick={() => setIsEditUserModalOpen(false)}>✕</button>
                  </div>
                  <form onSubmit={handleEditUser} className="form-group" style={{ gap: '15px' }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-nome">Nome do Operador</label>
                        <input
                          id="edit-nome"
                          className="form-input"
                          value={editingUser.nome}
                          onChange={(e) => setEditingUser({ ...editingUser, nome: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-email">E-mail Corporativo</label>
                        <input
                          id="edit-email"
                          type="email"
                          className="form-input"
                          value={editingUser.email}
                          onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-senha">Nova Senha (opcional)</label>
                        <input
                          id="edit-senha"
                          type="password"
                          placeholder="Deixe em branco para manter a atual"
                          className="form-input"
                          value={editingUser.senha}
                          onChange={(e) => setEditingUser({ ...editingUser, senha: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="edit-cargo">Perfil de Acesso</label>
                        <select
                          id="edit-cargo"
                          className="form-input"
                          value={editingUser.cargo}
                          onChange={(e) => setEditingUser({ ...editingUser, cargo: e.target.value })}
                          disabled={editingUser.email === user?.email}
                        >
                          <option value="advogado">Advogado</option>
                          <option value="revisor">Revisor</option>
                          <option value="admin">Administrador</option>
                        </select>
                        {editingUser.email === user?.email && (
                          <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                            Você não pode alterar seu próprio cargo de admin.
                          </small>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setIsEditUserModalOpen(false)}>Cancelar</button>
                      <button type="submit" className="btn btn-primary">💾 Salvar Alterações</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal de Confirmação de Exclusão */}
            {isDeleteConfirmOpen && deletingUser && (
              <div className="modal-overlay" onClick={() => setIsDeleteConfirmOpen(false)}>
                <div className="modal-content" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3 className="modal-title font-cinzel" style={{ color: 'var(--error)' }}>⚠️ Confirmar Exclusão</h3>
                    <button className="modal-close-btn" onClick={() => setIsDeleteConfirmOpen(false)}>✕</button>
                  </div>
                  <div style={{ padding: '15px 0', color: 'var(--text-primary)' }}>
                    <p>Você tem certeza que deseja excluir o operador <strong>{deletingUser.nome}</strong> ({deletingUser.email})?</p>
                    <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>Esta ação é irreversível e o operador perderá acesso imediato ao sistema.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsDeleteConfirmOpen(false)}>Cancelar</button>
                    <button type="button" className="btn btn-secondary" style={{ borderColor: 'var(--error)', color: 'var(--error)' }} onClick={handleDeleteUser}>🗑️ Confirmar Exclusão</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Modal de Revisão do Advogado */}
        {isReviewModalOpen && reviewingProcess && (
          <div className="modal-overlay" onClick={() => setIsReviewModalOpen(false)}>
            <div className="modal-content" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title font-cinzel">🔎 Revisar Minuta — ID: {reviewingProcess.id}</h3>
                <button className="modal-close-btn" onClick={() => setIsReviewModalOpen(false)}>✕</button>
              </div>
              
              {/* Tabs de Revisão */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))', marginBottom: '15px' }}>
                <button 
                  type="button" 
                  onClick={() => setActiveReviewTab(0)} 
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeReviewTab === 0 ? '2px solid var(--gold)' : 'none',
                    color: activeReviewTab === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  📋 Dados de Entrada (Fatos & Teses)
                </button>
                <button 
                  type="button" 
                  onClick={() => setActiveReviewTab(1)} 
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeReviewTab === 1 ? '2px solid var(--gold)' : 'none',
                    color: activeReviewTab === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✍️ Texto da Peça (Fundamentação & Pedidos)
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px', marginBottom: '15px' }}>
                {reviewMsg && <div className={`alert alert-${reviewMsg.type}`} style={{ marginBottom: '15px' }}>{reviewMsg.text}</div>}
                
                {activeReviewTab === 0 && (
                  <div className="form-group" style={{ gap: '15px' }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-cliente">Nome do Cliente</label>
                        <input
                          id="rev-cliente"
                          className="form-input"
                          value={reviewingProcess.cliente}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, cliente: e.target.value })}
                          disabled={reviewingProcess.status === 'PROTOCOLADO'}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-processo">Número do Processo</label>
                        <input
                          id="rev-processo"
                          className="form-input"
                          value={reviewingProcess.numero_processo}
                          disabled
                        />
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-juizo">Juízo</label>
                        <input
                          id="rev-juizo"
                          className="form-input"
                          value={reviewingProcess.juizo}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, juizo: e.target.value })}
                          disabled={reviewingProcess.status === 'PROTOCOLADO'}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-materia">Matéria Jurídica</label>
                        <select
                          id="rev-materia"
                          className="form-input"
                          value={reviewingProcess.materia}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, materia: e.target.value })}
                          disabled={reviewingProcess.status === 'PROTOCOLADO'}
                          style={{ cursor: 'pointer' }}
                        >
                          <option value="Geral">Geral</option>
                          {materias.map((m) => (
                            <option key={m.id} value={m.nome}>{m.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-prazo">Prazo Limite</label>
                        <input
                          id="rev-prazo"
                          type="date"
                          className="form-input"
                          value={reviewingProcess.data_prazo || ''}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, data_prazo: e.target.value })}
                          disabled={reviewingProcess.status === 'PROTOCOLADO'}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-tipo">Tipo de Peça</label>
                        <input
                          id="rev-tipo"
                          className="form-input"
                          value={reviewingProcess.tipo_peca}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, tipo_peca: e.target.value })}
                          disabled={reviewingProcess.status === 'PROTOCOLADO'}
                        />
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label" htmlFor="rev-status">Status do Caso</label>
                        <select
                          id="rev-status"
                          className="form-input"
                          value={reviewingProcess.status}
                          onChange={(e) => setReviewingProcess({ ...reviewingProcess, status: e.target.value })}
                          style={{ cursor: 'pointer' }}
                        >
                          <option value="PENDENTE">Pendente</option>
                          <option value="PROCESSANDO">Processando</option>
                          <option value="REVISAO">Revisão</option>
                          <option value="PROTOCOLADO">Protocolado / Aprovado</option>
                          <option value="ERRO_PROCESSAMENTO">Erro de Processamento</option>
                        </select>
                      </div>
                      <div className="form-group">
                        {/* Empty space for grid alignment */}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="rev-fatos">Resumo dos Fatos</label>
                      <textarea
                        id="rev-fatos"
                        className="form-input"
                        rows="6"
                        value={reviewingProcess.resumo_fatos}
                        onChange={(e) => setReviewingProcess({ ...reviewingProcess, resumo_fatos: e.target.value })}
                        disabled={reviewingProcess.status === 'PROTOCOLADO'}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="rev-teses">Teses Principais (uma por linha)</label>
                      <textarea
                        id="rev-teses"
                        className="form-input"
                        rows="4"
                        value={(reviewingProcess.teses_principais || []).join('\n')}
                        onChange={(e) => setReviewingProcess({ 
                          ...reviewingProcess, 
                          teses_principais: e.target.value.split('\n')
                        })}
                        disabled={reviewingProcess.status === 'PROTOCOLADO'}
                      />
                    </div>
                  </div>
                )}

                {activeReviewTab === 1 && (
                  <div className="form-group" style={{ gap: '15px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="rev-fundamentacao">Fundamentação Jurídica</label>
                      <textarea
                        id="rev-fundamentacao"
                        className="form-input"
                        style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5' }}
                        rows="14"
                        value={reviewingProcess.fundamentacao_revisada}
                        onChange={(e) => setReviewingProcess({ ...reviewingProcess, fundamentacao_revisada: e.target.value })}
                        disabled={reviewingProcess.status === 'PROTOCOLADO'}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="rev-pedidos">Pedidos</label>
                      <textarea
                        id="rev-pedidos"
                        className="form-input"
                        style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5' }}
                        rows="6"
                        value={reviewingProcess.pedidos_revisados}
                        onChange={(e) => setReviewingProcess({ ...reviewingProcess, pedidos_revisados: e.target.value })}
                        disabled={reviewingProcess.status === 'PROTOCOLADO'}
                      />
                    </div>

                    {reviewingProcess.status !== 'PROTOCOLADO' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        <input
                          type="checkbox"
                          id="salvar-rag-check"
                          checked={salvarRag}
                          onChange={(e) => setSalvarRag(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <label htmlFor="salvar-rag-check" style={{ fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                          Realimentar o RAG (pgvector) com esta peça como precedente para casos futuros
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.1))', paddingTop: '15px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsReviewModalOpen(false)}>
                  Fechar
                </button>
                {reviewingProcess.status !== 'PROTOCOLADO' && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={handleSaveReviewDraft}>
                      💾 Salvar Rascunho
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ borderColor: 'var(--gold)' }} onClick={handleReprocessProcess}>
                      ⚡ Regerar com IA
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleApproveProcess}>
                      ✅ Aprovar & Gerar Docx
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      
      {processingMessage && (
        <div className="processing-overlay">
          <div className="processing-card">
            <div className="spinner-gold"></div>
            <p className="processing-text font-cinzel">{processingMessage.toUpperCase()}</p>
            <span className="processing-sub">Conectando aos modelos de IA & Banco Vetorial</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
