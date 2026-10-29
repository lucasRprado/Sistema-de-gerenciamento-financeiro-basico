import { useEffect, useState } from 'react';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatarMoeda = (valor) => moeda.format(valor || 0);
const dataHoje = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
}).format(new Date()).toLocaleUpperCase('pt-BR');

export default function App() {
  const lotes = [
    { id: 1, nome: 'Lote 1', valor: 500.00 },
    { id: 2, nome: 'Lote 2', valor: 650.00 },
  ];

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState(lotes[0].valor);
  const [parcelas, setParcelas] = useState(1);
  const [diaVencimento, setDiaVencimento] = useState('');
  const [participantes, setParticipantes] = useState([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [modalPagamento, setModalPagamento] = useState({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: '',
  });

  const valorParcela = parcelas > 0 ? (loteSelecionado / parcelas).toFixed(2) : '0.00';

  useEffect(() => {
    const q = query(collection(db, 'Participantes'), orderBy('numero_id', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map((participante) => ({
        id: participante.id,
        ...participante.data(),
      }));
      setParticipantes(lista);
    });
    return () => unsubscribe();
  }, []);

  const totalEsperado = participantes.reduce((acc, participante) => acc + (participante.valor_total || 0), 0);
  const totalPendente = participantes.reduce((acc, participante) => acc + (participante.saldo_devedor || 0), 0);
  const totalRecebido = totalEsperado - totalPendente;
  const participantesFiltrados = participantes.filter((participante) =>
    participante.nome.toLowerCase().includes(termoPesquisa.toLowerCase()),
  );
  const percentualRecebido = totalEsperado > 0 ? (totalRecebido / totalEsperado) * 100 : 0;

  const formatarCelular = (valor) => {
    let v = valor.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length <= 2) return v;
    if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  };

  const handleSalvar = async () => {
    if (!nome || !diaVencimento || !parcelas) {
      alert('Por favor, preencha os campos obrigatórios (nome, parcelas e dia de vencimento).');
      return;
    }

    try {
      const q = query(collection(db, 'Participantes'), orderBy('numero_id', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      let proximoNumero = 1;
      if (!querySnapshot.empty) {
        proximoNumero = querySnapshot.docs[0].data().numero_id + 1;
      }

      const stringId = `ID${proximoNumero.toString().padStart(2, '0')}`;
      await setDoc(doc(db, 'Participantes', stringId), {
        numero_id: proximoNumero,
        nome,
        email,
        celular,
        valor_total: loteSelecionado,
        quantidade_parcelas: parcelas,
        valor_parcela: Number(valorParcela),
        dia_vencimento: diaVencimento,
        saldo_devedor: loteSelecionado,
        historico_pagamentos: [],
      });

      setNome('');
      setEmail('');
      setCelular('');
      setDiaVencimento('');
      setParcelas(1);
    } catch (error) {
      console.error('Erro ao guardar documento: ', error);
      alert('Erro ao guardar os dados.');
    }
  };

  const abrirModal = (participante) => {
    if (participante.saldo_devedor <= 0) {
      alert('Este participante já tem o saldo totalmente pago!');
      return;
    }
    setModalPagamento({
      aberto: true,
      participante,
      tipo: 'fixo',
      valorPersonalizado: '',
    });
  };

  const confirmarPagamento = async () => {
    const participante = modalPagamento.participante;
    const valorAAbater = modalPagamento.tipo === 'fixo'
      ? participante.valor_parcela
      : Number(modalPagamento.valorPersonalizado);

    if (!valorAAbater || valorAAbater <= 0) {
      alert('Por favor, insira um valor válido maior que zero.');
      return;
    }

    if (valorAAbater > participante.saldo_devedor) {
      alert(`O valor digitado (${formatarMoeda(valorAAbater)}) não pode ser maior que o saldo devedor atual (${formatarMoeda(participante.saldo_devedor)}).`);
      return;
    }

    const confirmar = window.confirm(`Confirmar o abatimento de ${formatarMoeda(valorAAbater)} no saldo de ${participante.nome}?`);
    if (!confirmar) return;

    let novoSaldo = participante.saldo_devedor - valorAAbater;
    if (novoSaldo < 0.05) novoSaldo = 0;

    const novoPagamento = {
      data: new Date().toLocaleString('pt-BR'),
      valor: valorAAbater,
    };

    try {
      const participanteRef = doc(db, 'Participantes', participante.id);
      await updateDoc(participanteRef, {
        saldo_devedor: Number(novoSaldo.toFixed(2)),
        historico_pagamentos: arrayUnion(novoPagamento),
      });
      setModalPagamento({
        aberto: false,
        participante: null,
        tipo: 'fixo',
        valorPersonalizado: '',
      });
    } catch (error) {
      console.error('Erro ao atualizar o saldo: ', error);
      alert('Erro ao registar o pagamento.');
    }
  };

  const handleExcluir = async (id, nomeParticipante) => {
    const confirmar = window.confirm(`ATENÇÃO: Tem a certeza de que deseja excluir permanentemente o registo de ${nomeParticipante}?`);
    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, 'Participantes', id));
    } catch (error) {
      console.error('Erro ao excluir documento: ', error);
      alert('Erro ao excluir o participante.');
    }
  };

  const handleLembreteWhatsApp = (participante) => {
    const numeroLimpo = participante.celular.replace(/\D/g, '');
    if (numeroLimpo.length < 10) {
      alert('O número de telemóvel registado parece estar inválido ou em falta.');
      return;
    }
    const mensagem = `Olá ${participante.nome}! Tudo bem? Passando para relembrar do vencimento da sua parcela do acampamento no valor de ${formatarMoeda(participante.valor_parcela)}, programada para o dia ${participante.dia_vencimento}. Qualquer dúvida, estou à disposição!`;
    const url = `https://wa.me/55${numeroLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  const fecharModal = () => setModalPagamento({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: '',
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio" aria-label="Acampa, início">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M5 25 16 6l11 19H5Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
              <path d="m11 25 5-9 5 9M16 16v9" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-copy"><strong>acampa</strong><small>gestão do acampamento</small></span>
        </a>

        <div className="sidebar-label">MENU PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navegação principal">
          <a className="nav-link active" href="#inicio"><span aria-hidden="true">▦</span> Visão geral</a>
          <a className="nav-link" href="#participantes"><span aria-hidden="true">♧</span> Participantes</a>
          <a className="nav-link" href="#novo-participante"><span aria-hidden="true">＋</span> Novo cadastro</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="camp-card">
            <div className="camp-icon" aria-hidden="true">✳</div>
            <strong>Seu acampamento</strong>
            <span>Uma experiência para guardar.</span>
          </div>
          <div className="profile">
            <span className="avatar">AD</span>
            <span className="profile-info"><strong>Administrador</strong><small>Gestão financeira</small></span>
            <span className="profile-menu" aria-hidden="true">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="inicio">
        <header className="topbar">
          <div className="breadcrumb"><span>Painel</span><span className="breadcrumb-separator">/</span><strong>Visão geral</strong></div>
          <div className="topbar-right">
            <span className="sync-status"><span className="status-dot" /> Dados sincronizados</span>
            <span className="topbar-avatar" aria-label="Administrador">AD</span>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{dataHoje}</p>
              <h1>Visão geral</h1>
              <p className="page-subtitle">Acompanhe as inscrições e a saúde financeira do seu acampamento.</p>
            </div>
            <a className="button button-primary welcome-action" href="#novo-participante"><span aria-hidden="true">＋</span> Novo participante</a>
          </section>

          <section className="metrics-grid" aria-label="Resumo financeiro">
            <article className="metric-card metric-expected">
              <div className="metric-top">
                <span className="metric-label">Total esperado</span>
                <span className="metric-icon" aria-hidden="true">↗</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalEsperado)}</strong>
              <span className="metric-caption">Valor total das inscrições</span>
              <div className="metric-accent" />
            </article>
            <article className="metric-card metric-received">
              <div className="metric-top">
                <span className="metric-label">Total recebido</span>
                <span className="metric-icon" aria-hidden="true">✓</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalRecebido)}</strong>
              <span className="metric-caption">{percentualRecebido.toFixed(0)}% do total esperado</span>
              <div className="progress-track" role="progressbar" aria-label="Percentual recebido" aria-valuenow={percentualRecebido} aria-valuemin="0" aria-valuemax="100">
                <span style={{ width: `${Math.min(percentualRecebido, 100)}%` }} />
              </div>
            </article>
            <article className="metric-card metric-pending">
              <div className="metric-top">
                <span className="metric-label">Total pendente</span>
                <span className="metric-icon" aria-hidden="true">◷</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalPendente)}</strong>
              <span className="metric-caption">Aguardando pagamento</span>
              <div className="metric-accent" />
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel registration-panel" id="novo-participante">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">INSCRIÇÕES</span>
                  <h2>Novo participante</h2>
                  <p>Preencha os dados para adicionar uma inscrição.</p>
                </div>
                <span className="panel-heading-icon" aria-hidden="true">＋</span>
              </div>

              <form className="registration-form" onSubmit={(event) => { event.preventDefault(); handleSalvar(); }}>
                <label className="field field-full">
                  <span>Nome completo <span className="required">*</span></span>
                  <input type="text" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Ana Silva" autoComplete="name" required />
                </label>
                <label className="field field-full">
                  <span>E-mail</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com.br" autoComplete="email" />
                </label>
                <label className="field field-full">
                  <span>Celular</span>
                  <input type="tel" value={celular} onChange={(event) => setCelular(formatarCelular(event.target.value))} placeholder="(11) 99999-9999" autoComplete="tel" />
                </label>
                <label className="field field-full">
                  <span>Lote</span>
                  <select value={loteSelecionado} onChange={(event) => setLoteSelecionado(Number(event.target.value))}>
                    {lotes.map((lote) => <option key={lote.id} value={lote.valor}>{lote.nome} · {formatarMoeda(lote.valor)}</option>)}
                  </select>
                </label>
                <div className="field-row field-full">
                  <label className="field">
                    <span>Parcelas <span className="required">*</span></span>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={parcelas}
                      onChange={(event) => {
                        const valor = event.target.value;
                        if (valor === '') setParcelas('');
                        else if (Number(valor) > 12) setParcelas(12);
                        else if (Number(valor) < 1) setParcelas(1);
                        else setParcelas(Number(valor));
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Vencimento (dia) <span className="required">*</span></span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={diaVencimento}
                      onChange={(event) => {
                        const valor = event.target.value;
                        if (valor === '') setDiaVencimento('');
                        else if (Number(valor) > 31) setDiaVencimento(31);
                        else if (Number(valor) < 1) setDiaVencimento(1);
                        else setDiaVencimento(Number(valor));
                      }}
                      placeholder="Dia"
                      required
                    />
                  </label>
                </div>
                <div className="installment-preview field-full">
                  <span className="preview-icon" aria-hidden="true">▤</span>
                  <span><small>Valor por parcela</small><strong>{formatarMoeda(Number(valorParcela))}</strong></span>
                  <span className="preview-count">{parcelas || 0}x</span>
                </div>
                <button className="button button-primary submit-button field-full" type="submit">Cadastrar participante <span aria-hidden="true">→</span></button>
                <p className="form-note field-full"><span className="required">*</span> Campos obrigatórios</p>
              </form>
            </article>

            <section className="panel participants-panel" id="participantes">
              <div className="participants-heading">
                <div>
                  <span className="section-kicker">ACOMPANHAMENTO</span>
                  <h2>Participantes <span className="count-badge">{participantes.length}</span></h2>
                  <p>Gerencie inscrições e pagamentos.</p>
                </div>
                <label className="search-field">
                  <span className="search-icon" aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="Buscar participante..."
                    value={termoPesquisa}
                    onChange={(event) => setTermoPesquisa(event.target.value)}
                    aria-label="Buscar participante"
                  />
                  <kbd>⌘ K</kbd>
                </label>
              </div>

              <div className="table-scroll">
                <table className="participants-table">
                  <thead>
                    <tr>
                      <th>PARTICIPANTE</th>
                      <th>VENCIMENTO</th>
                      <th>HISTÓRICO</th>
                      <th>SALDO PENDENTE</th>
                      <th><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantesFiltrados.map((participante) => {
                      const pagamentos = participante.historico_pagamentos || [];
                      return (
                        <tr key={participante.id}>
                          <td>
                            <div className="participant-cell">
                              <span className="participant-avatar">{participante.nome?.trim().charAt(0).toUpperCase() || '?'}</span>
                              <span className="participant-info">
                                <strong>{participante.nome}</strong>
                                <small>{participante.email || participante.id}</small>
                              </span>
                            </div>
                          </td>
                          <td><span className="due-date">Dia {participante.dia_vencimento}</span></td>
                          <td>
                            {pagamentos.length > 0 ? (
                              <details className="payment-history">
                                <summary>{pagamentos.length} {pagamentos.length === 1 ? 'pagamento' : 'pagamentos'}</summary>
                                <ul className="payment-history-list">
                                  {pagamentos.map((pagamento, index) => (
                                    <li key={`${pagamento.data}-${index}`}>
                                      <span>{pagamento.data}</span>
                                      <strong>{formatarMoeda(pagamento.valor)}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : <span className="history-empty">Nenhum pagamento</span>}
                          </td>
                          <td>
                            <span className={`balance ${participante.saldo_devedor > 0 ? 'balance-pending' : 'balance-paid'}`}>
                              {formatarMoeda(participante.saldo_devedor)}
                            </span>
                            {participante.saldo_devedor <= 0 && <span className="paid-label">Quitado</span>}
                          </td>
                          <td>
                            <div className="row-actions">
                              {participante.saldo_devedor > 0
                                ? <button className="button button-small button-pay" onClick={() => abrirModal(participante)}>Registrar pagamento</button>
                                : <span className="paid-check" aria-label="Pagamento quitado">✓</span>}
                              <button className="icon-button whatsapp-button" onClick={() => handleLembreteWhatsApp(participante)} aria-label={`Enviar lembrete para ${participante.nome}`} title="Enviar lembrete pelo WhatsApp">↗</button>
                              <button className="icon-button delete-button" onClick={() => handleExcluir(participante.id, participante.nome)} aria-label={`Excluir ${participante.nome}`} title="Excluir participante">×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {participantesFiltrados.length === 0 && (
                      <tr>
                        <td className="empty-state" colSpan="5">
                          <span className="empty-icon" aria-hidden="true">⌕</span>
                          <strong>{termoPesquisa ? 'Nenhum resultado encontrado' : 'Ainda não há participantes'}</strong>
                          <span>{termoPesquisa ? 'Tente buscar por outro nome.' : 'Cadastre o primeiro participante para começar.'}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>Exibindo <strong>{participantesFiltrados.length}</strong> de <strong>{participantes.length}</strong> participantes</span>
                <span>Atualizado em tempo real <span className="status-dot" /></span>
              </div>
            </section>
          </section>
          <footer className="page-footer">Acampa <span>·</span> Gestão simples, momentos inesquecíveis.</footer>
        </div>
      </main>

      {modalPagamento.aberto && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) fecharModal(); }}>
          <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <div className="modal-heading">
              <span className="modal-icon" aria-hidden="true">↗</span>
              <button className="modal-close" onClick={fecharModal} aria-label="Fechar">×</button>
              <span className="section-kicker">FINANCEIRO</span>
              <h2 id="payment-title">Registrar pagamento</h2>
              <p>Confirme o valor recebido de <strong>{modalPagamento.participante?.nome}</strong>.</p>
            </div>
            <div className="modal-balance">
              <span>Saldo em aberto</span>
              <strong>{formatarMoeda(modalPagamento.participante?.saldo_devedor)}</strong>
            </div>
            <div className="payment-options">
              <label className={`payment-option ${modalPagamento.tipo === 'fixo' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipo_pagamento"
                  checked={modalPagamento.tipo === 'fixo'}
                  onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'fixo' })}
                />
                <span className="radio-custom" />
                <span><strong>Parcela fixa</strong><small>Valor da parcela cadastrada</small></span>
                <b>{formatarMoeda(modalPagamento.participante?.valor_parcela)}</b>
              </label>
              <label className={`payment-option ${modalPagamento.tipo === 'outro' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipo_pagamento"
                  checked={modalPagamento.tipo === 'outro'}
                  onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'outro' })}
                />
                <span className="radio-custom" />
                <span><strong>Outro valor</strong><small>Informar valor recebido</small></span>
              </label>
            </div>
            {modalPagamento.tipo === 'outro' && (
              <label className="field modal-value-field">
                <span>Valor recebido</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={modalPagamento.valorPersonalizado}
                  onChange={(event) => setModalPagamento({ ...modalPagamento, valorPersonalizado: event.target.value })}
                  placeholder="0,00"
                  autoFocus
                />
              </label>
            )}
            <div className="modal-actions">
              <button className="button button-secondary" onClick={fecharModal}>Cancelar</button>
              <button className="button button-primary" onClick={confirmarPagamento}>Confirmar pagamento <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
