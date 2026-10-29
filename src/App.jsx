import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDocs, query, orderBy, limit, deleteDoc, arrayUnion } from "firebase/firestore"; 
import { db } from './firebase'; 

export default function App() {
  const lotes = [
    { id: 1, nome: "Lote 1", valor: 500.00 },
    { id: 2, nome: "Lote 2", valor: 650.00 }
  ];

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [loteSelecionado, setLoteSelecionado] = useState(lotes[0].valor);
  const [parcelas, setParcelas] = useState(1);
  const [diaVencimento, setDiaVencimento] = useState("");
  
  const [participantes, setParticipantes] = useState([]);
  
  // Novo Estado: Termo de Pesquisa
  const [termoPesquisa, setTermoPesquisa] = useState("");

  const [modalPagamento, setModalPagamento] = useState({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: ''
  });

  const valorParcela = (parcelas && parcelas > 0) ? (loteSelecionado / parcelas).toFixed(2) : "0.00";

  useEffect(() => {
    const q = query(collection(db, "Participantes"), orderBy("numero_id", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setParticipantes(lista);
    });
    return () => unsubscribe();
  }, []);

  // Lógica dos Cartões do Dashboard Financeiro
  const totalEsperado = participantes.reduce((acc, p) => acc + (p.valor_total || 0), 0);
  const totalPendente = participantes.reduce((acc, p) => acc + (p.saldo_devedor || 0), 0);
  const totalRecebido = totalEsperado - totalPendente;

  // Lógica de Filtro da Barra de Pesquisa
  const participantesFiltrados = participantes.filter(p => 
    p.nome.toLowerCase().includes(termoPesquisa.toLowerCase())
  );

  const formatarCelular = (valor) => {
    let v = valor.replace(/\D/g, ""); 
    if (v.length > 11) v = v.slice(0, 11); 
    
    if (v.length <= 2) return v;
    if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  };

  const handleSalvar = async () => {
    if (!nome || !diaVencimento || !parcelas) {
      alert("Por favor, preencha os campos obrigatórios (nome, parcelas e dia de vencimento).");
      return;
    }

    try {
      const q = query(collection(db, "Participantes"), orderBy("numero_id", "desc"), limit(1));
      const querySnapshot = await getDocs(q);
      
      let proximoNumero = 1;
      if (!querySnapshot.empty) {
        proximoNumero = querySnapshot.docs[0].data().numero_id + 1;
      }

      const stringId = `ID${proximoNumero.toString().padStart(2, '0')}`;

      await setDoc(doc(db, "Participantes", stringId), {
        numero_id: proximoNumero,
        nome: nome,
        email: email,
        celular: celular,
        valor_total: loteSelecionado,
        quantidade_parcelas: parcelas,
        valor_parcela: Number(valorParcela),
        dia_vencimento: diaVencimento,
        saldo_devedor: loteSelecionado,
        historico_pagamentos: []
      });
      
      setNome(""); setEmail(""); setCelular(""); setDiaVencimento(""); setParcelas(1);
    } catch (error) {
      console.error("Erro ao guardar documento: ", error);
      alert("Erro ao guardar os dados.");
    }
  };

  const abrirModal = (participante) => {
    if (participante.saldo_devedor <= 0) {
      alert("Este participante já tem o saldo totalmente pago!");
      return;
    }
    setModalPagamento({
      aberto: true,
      participante: participante,
      tipo: 'fixo',
      valorPersonalizado: ''
    });
  };

  const confirmarPagamento = async () => {
    const p = modalPagamento.participante;
    
    let valorAAbater = modalPagamento.tipo === 'fixo' 
      ? p.valor_parcela 
      : Number(modalPagamento.valorPersonalizado);

    if (!valorAAbater || valorAAbater <= 0) {
      alert("Por favor, insira um valor válido maior que zero.");
      return;
    }

    if (valorAAbater > p.saldo_devedor) {
      alert(`O valor digitado (R$ ${valorAAbater}) não pode ser maior que o saldo devedor atual (R$ ${p.saldo_devedor}).`);
      return;
    }

    const confirmar = window.confirm(`Confirmar o abatimento de R$ ${valorAAbater.toFixed(2)} no saldo de ${p.nome}?`);
    if (!confirmar) return;

    let novoSaldo = p.saldo_devedor - valorAAbater;
    if (novoSaldo < 0.05) novoSaldo = 0; 

    const dataHoraAtual = new Date().toLocaleString('pt-BR');
    const novoPagamento = {
      data: dataHoraAtual,
      valor: valorAAbater
    };

    try {
      const participanteRef = doc(db, "Participantes", p.id);
      await updateDoc(participanteRef, {
        saldo_devedor: Number(novoSaldo.toFixed(2)),
        historico_pagamentos: arrayUnion(novoPagamento)
      });
      
      setModalPagamento({ aberto: false, participante: null, tipo: 'fixo', valorPersonalizado: '' });
    } catch (error) {
      console.error("Erro ao atualizar o saldo: ", error);
      alert("Erro ao registar o pagamento.");
    }
  };

  const handleExcluir = async (id, nome) => {
    const confirmar = window.confirm(`ATENÇÃO: Tem a certeza de que deseja excluir permanentemente o registo de ${nome}?`);
    if (!confirmar) return;
    
    try {
      await deleteDoc(doc(db, "Participantes", id));
    } catch (error) {
      console.error("Erro ao excluir documento: ", error);
      alert("Erro ao excluir o participante.");
    }
  };

  const handleLembreteWhatsApp = (participante) => {
    const numeroLimpo = participante.celular.replace(/\D/g, '');
    if (numeroLimpo.length < 10) {
      alert("O número de telemóvel registado parece estar inválido ou em falta.");
      return;
    }
    const mensagem = `Olá ${participante.nome}! Tudo bem? Passando para relembrar do vencimento da sua parcela do acampamento no valor de R$ ${participante.valor_parcela.toFixed(2)}, programada para o dia ${participante.dia_vencimento}. Qualquer dúvida, estou à disposição!`;
    const url = `https://wa.me/55${numeroLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* NOVO: DASHBOARD FINANCEIRO */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 250px', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#1565c0' }}>Total Esperado</h3>
          <h2 style={{ margin: 0, color: '#0d47a1', fontSize: '28px' }}>R$ {totalEsperado.toFixed(2)}</h2>
        </div>
        <div style={{ flex: '1 1 250px', padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>Total Recebido</h3>
          <h2 style={{ margin: 0, color: '#1b5e20', fontSize: '28px' }}>R$ {totalRecebido.toFixed(2)}</h2>
        </div>
        <div style={{ flex: '1 1 250px', padding: '20px', backgroundColor: '#ffebee', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#c62828' }}>Total Pendente</h3>
          <h2 style={{ margin: 0, color: '#b71c1c', fontSize: '28px' }}>R$ {totalPendente.toFixed(2)}</h2>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', position: 'relative' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '300px', maxWidth: '400px' }}>
          <h2>Novo Participante</h2>
          <label>Nome:<input type="text" value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: '100%', padding: '8px' }}/></label>
          <label>E-mail:<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '8px' }} placeholder="meuemail@exemplo.com.br"/></label>
          <label>Celular:<input type="tel" value={celular} onChange={(e) => setCelular(formatarCelular(e.target.value))} style={{ width: '100%', padding: '8px' }} placeholder="(11) 99999-9999"/></label>
          
          <label>Lote:
            <select value={loteSelecionado} onChange={(e) => setLoteSelecionado(Number(e.target.value))} style={{ width: '100%', padding: '8px' }}>
              {lotes.map(l => <option key={l.id} value={l.valor}>{l.nome} - R$ {l.valor.toFixed(2)}</option>)}
            </select>
          </label>
          
          <label>Parcelas:
            <input 
              type="number" min="1" max="12" value={parcelas} 
              onChange={(e) => {
                let val = e.target.value;
                if (val === "") setParcelas(""); 
                else if (Number(val) > 12) setParcelas(12); 
                else if (Number(val) < 1) setParcelas(1); 
                else setParcelas(Number(val));
              }} 
              style={{ width: '100%', padding: '8px' }}
            />
          </label>
          <div style={{ padding: '10px', backgroundColor: '#f0f0f0' }}><strong>Parcela:</strong> R$ {valorParcela}</div>
          
          <label>Dia de Vencimento:
            <input 
              type="number" min="1" max="31" value={diaVencimento} 
              onChange={(e) => {
                let val = e.target.value;
                if (val === "") setDiaVencimento(""); 
                else if (Number(val) > 31) setDiaVencimento(31); 
                else if (Number(val) < 1) setDiaVencimento(1); 
                else setDiaVencimento(Number(val));
              }} 
              style={{ width: '100%', padding: '8px' }}
            />
          </label>
          
          <button onClick={handleSalvar} style={{ padding: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px' }}>Registar</button>
        </div>

        <div style={{ flex: 1, minWidth: '600px', overflowX: 'auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0 }}>Lista de Participantes</h2>
            
            {/* NOVA: BARRA DE PESQUISA */}
            <input 
              type="text" 
              placeholder="🔍 Procurar por nome..." 
              value={termoPesquisa}
              onChange={(e) => setTermoPesquisa(e.target.value)}
              style={{ padding: '10px', width: '300px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead>
              <tr style={{ backgroundColor: '#eee' }}>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>ID</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Nome</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Venc.</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Histórico de Pagamentos</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>Saldo Devedor</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #ccc', textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* O map agora é feito em participantesFiltrados em vez de participantes */}
              {participantesFiltrados.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{p.id}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{p.nome}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>Dia {p.dia_vencimento}</td>
                  
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                    {p.historico_pagamentos && p.historico_pagamentos.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '15px', color: '#555' }}>
                        {p.historico_pagamentos.map((pagamento, index) => (
                          <li key={index}>{pagamento.data} (R$ {pagamento.valor.toFixed(2)})</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>Nenhum pagamento</span>
                    )}
                  </td>

                  <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontWeight: 'bold', color: p.saldo_devedor > 0 ? '#d32f2f' : '#388e3c' }}>
                    R$ {p.saldo_devedor.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                    {p.saldo_devedor > 0 ? (
                      <button onClick={() => abrirModal(p)} style={{ padding: '6px 10px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                        Pagar
                      </button>
                    ) : (
                      <span style={{ color: '#388e3c', fontWeight: 'bold', marginRight: '5px' }}>Pago</span>
                    )}
                    
                    <button onClick={() => handleLembreteWhatsApp(p)} style={{ padding: '6px 10px', marginLeft: '5px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                      Avisar
                    </button>

                    <button onClick={() => handleExcluir(p.id, p.nome)} style={{ padding: '6px 10px', marginLeft: '5px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              
              {/* Mensagem caso a pesquisa não encontre ninguém */}
              {participantesFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#777' }}>
                    Nenhum participante encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* JANELA MODAL DE PAGAMENTO */}
        {modalPagamento.aberto && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', minWidth: '350px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <h3 style={{ marginTop: 0 }}>Registrar Pagamento</h3>
              <p style={{ margin: '5px 0 20px 0', color: '#555' }}>
                Participante: <strong>{modalPagamento.participante?.nome}</strong><br/>
                Saldo atual: R$ {modalPagamento.participante?.saldo_devedor.toFixed(2)}
              </p>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="tipo_pagamento" 
                    checked={modalPagamento.tipo === 'fixo'} 
                    onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'fixo' })}
                    style={{ marginRight: '8px' }}
                  />
                  Parcela Fixa (R$ {modalPagamento.participante?.valor_parcela.toFixed(2)})
                </label>
                
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="tipo_pagamento" 
                    checked={modalPagamento.tipo === 'outro'} 
                    onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'outro' })}
                    style={{ marginRight: '8px' }}
                  />
                  Outro Valor
                </label>
              </div>

              {modalPagamento.tipo === 'outro' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>Digite o valor (R$):</label>
                  <input 
                    type="number" min="0.01" step="0.01"
                    value={modalPagamento.valorPersonalizado} 
                    onChange={(e) => setModalPagamento({ ...modalPagamento, valorPersonalizado: e.target.value })}
                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    placeholder="Ex: 150.00"
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button 
                  onClick={() => setModalPagamento({ aberto: false, participante: null, tipo: 'fixo', valorPersonalizado: '' })}
                  style={{ padding: '10px 15px', backgroundColor: '#e0e0e0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmarPagamento}
                  style={{ padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}