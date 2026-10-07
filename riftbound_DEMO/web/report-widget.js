function buildReportWidgetHtml(reportCfg, stage, perspective, defaults = {}, ids = {}) {
    if (!reportCfg) return '';

    const kind = reportCfg.kind || 'games';


    if (kind === 'games') {
        let toWin = 2;
        if (reportCfg.games_to_win) {
            toWin = typeof reportCfg.games_to_win === 'number' ? reportCfg.games_to_win : (reportCfg.games_to_win[stage] || 2);
        }
        const maxDraws = (typeof reportCfg.max_draws === 'number') ? reportCfg.max_draws : toWin;
        const allowDraws = !!reportCfg.draws;
        
        let html = '<div class="report-inputs-grid" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">';
        
        const buildSelect = (id, label, maxVal, selectedVal) => {
            let sel = `<div class="report-select-col score-field" style="flex:1; min-width:80px;"><label for="${id}" class="form-label report-select-label" id="${id}Label">${escapeHtml(label)}</label><select id="${id}" class="report-select select-input">`;
            for (let i = 0; i <= maxVal; i++) {
                sel += `<option value="${i}"${selectedVal == i ? ' selected' : ''}>${i}</option>`;
            }
            sel += `</select></div>`;
            return sel;
        };

        if (perspective === 'player' || perspective === 'elim-player') {
            const myId = ids.myId || ids.myWins || (perspective === 'elim-player' ? 'elimMyScore' : 'reportMyWins');
            const oppId = ids.oppId || ids.oppWins || (perspective === 'elim-player' ? 'elimOppScore' : 'reportOppWins');
            const drawId = ids.drawId || ids.draws || 'reportDraws';
            const myLabel = ids.myLabel || '你贏幾局';
            const oppLabel = ids.oppLabel || '對手贏幾局';
            const drawLabel = ids.drawLabel || '平手局數';
            const myVal = defaults.myWins ?? defaults.myScore ?? 0;
            const oppVal = defaults.oppWins ?? defaults.oppScore ?? 0;
            const drawVal = defaults.draws ?? 0;

            html += buildSelect(myId, myLabel, toWin, myVal);
            html += buildSelect(oppId, oppLabel, toWin, oppVal);
            if (allowDraws) {
                html += buildSelect(drawId, drawLabel, maxDraws, drawVal);
            }
        } else if (perspective === 'judge' || perspective === 'elim-judge') {
            const p1Id = ids.p1Id || ids.p1Wins || (perspective === 'elim-judge' ? 'ejP1Score' : 'resP1');
            const p2Id = ids.p2Id || ids.p2Wins || (perspective === 'elim-judge' ? 'ejP2Score' : 'resP2');
            const drawId = ids.drawId || ids.draws || 'resDraws';
            const p1Label = ids.p1Label || '玩家 1 勝';
            const p2Label = ids.p2Label || '玩家 2 勝';
            const drawLabel = ids.drawLabel || '平手局數';
            const p1Val = defaults.p1Wins ?? defaults.p1Score ?? 0;
            const p2Val = defaults.p2Wins ?? defaults.p2Score ?? 0;
            const drawVal = defaults.draws ?? 0;

            html += buildSelect(p1Id, p1Label, toWin, p1Val);
            html += buildSelect(p2Id, p2Label, toWin, p2Val);
            if (allowDraws) {
                html += buildSelect(drawId, drawLabel, maxDraws, drawVal);
            }
        }
        html += '</div>';
        return html;
    } else if (kind === 'score') {
        if (perspective === 'player' || perspective === 'elim-player' || perspective === 'judge' || perspective === 'elim-judge') {
            const maxScore = reportCfg.max_score || 4;
            let html = '<div class="report-inputs-grid" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">';
            
            const buildSelect = (id, label, maxVal, selectedVal) => {
                let sel = `<div class="report-select-col score-field" style="flex:1; min-width:80px;"><label for="${id}" class="form-label report-select-label" id="${id}Label">${escapeHtml(label)}</label><select id="${id}" class="score-select select-input">`;
                for (let i = 0; i <= maxVal; i++) {
                    sel += `<option value="${i}"${selectedVal == i ? ' selected' : ''}>${i} 分</option>`;
                }
                sel += `</select></div>`;
                return sel;
            };

            if (perspective === 'player' || perspective === 'elim-player') {
                const myId = ids.myId || ids.myScore || (perspective === 'elim-player' ? 'elimMyScore' : 'reportMyWins');
                const oppId = ids.oppId || ids.oppScore || (perspective === 'elim-player' ? 'elimOppScore' : 'reportOppWins');
                const myLabel = ids.myLabel || '你的得分';
                const oppLabel = ids.oppLabel || '對手得分';
                const myVal = defaults.myScore ?? defaults.myWins ?? 0;
                const oppVal = defaults.oppScore ?? defaults.oppWins ?? 0;

                html += buildSelect(myId, myLabel, maxScore, myVal);
                html += buildSelect(oppId, oppLabel, maxScore, oppVal);
            } else {
                const p1Id = ids.p1Id || ids.p1Score || (perspective === 'elim-judge' ? 'ejP1Score' : 'resP1');
                const p2Id = ids.p2Id || ids.p2Score || (perspective === 'elim-judge' ? 'ejP2Score' : 'resP2');
                const p1Label = ids.p1Label || '玩家 1 得分';
                const p2Label = ids.p2Label || '玩家 2 得分';
                const p1Val = defaults.p1Score ?? defaults.p1Wins ?? 0;
                const p2Val = defaults.p2Score ?? defaults.p2Wins ?? 0;

                html += buildSelect(p1Id, p1Label, maxScore, p1Val);
                html += buildSelect(p2Id, p2Label, maxScore, p2Val);
            }
            html += '</div>';
            return html;
        } else if (perspective === 'judge-points' || perspective === 'elim-judge-points') {
            const rawPoints = reportCfg.points || [
                { type: 'xtreme', label: '極限 (+3)' },
                { type: 'over', label: '擊飛 (+2)' },
                { type: 'burst', label: '爆裂 (+2)' },
                { type: 'spin', label: '迴轉 (+1)' }
            ];
            const points = rawPoints.map(pt => ({
                type: pt.type || pt.key,
                label: pt.label.includes('(') ? pt.label : `${pt.label}${pt.value ? ` (+${pt.value})` : ''}`
            }));
            
            let html = '<div class="point-grid" style="display:flex; gap:10px;">';
            
            const buildPointCol = (side) => {
                const pTitle = side === 'p1' ? (ids.p1Name || '') : (ids.p2Name || '');
                let col = `<div style="flex:1;"><div id="ej${side.toUpperCase()}PointColTitle" class="point-col-title" style="margin-bottom:8px; font-weight:bold;">${escapeHtml(pTitle)}</div>`;
                points.forEach(pt => {
                    col += `<button type="button" style="width:100%; display:block; margin-bottom:6px;" class="btn btn-secondary ej-point" data-side="${side}" data-type="${escapeHtml(pt.type)}">${escapeHtml(pt.label)}</button>`;
                });
                col += `</div>`;
                return col;
            };
            
            html += buildPointCol('p1');
            html += buildPointCol('p2');
            html += '</div>';
            return html;
        }
    }
    return '';
}
