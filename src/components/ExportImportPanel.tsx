'use client';

import { useState, useRef } from 'react';
import {
    exportAndDownloadJSON,
    importFromJSON,
    downloadICS,
    downloadSessionsICS,
    ImportResult
} from '../lib/exportImport';
import { DayPlan } from '../types/plan';

interface ExportImportPanelProps {
    weeklyPlan?: DayPlan[];
    onImportComplete?: () => void;
}

export default function ExportImportPanel({ weeklyPlan, onImportComplete }: ExportImportPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [importOptions, setImportOptions] = useState({
        replaceExisting: false,
        skipDuplicates: true,
        includeLogs: false
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    // ============ EXPORT HANDLERS ============

    const handleExportJSON = async () => {
        setLoading(true);
        try {
            await exportAndDownloadJSON(importOptions.includeLogs);
            showMessage('success', 'JSON dosyası başarıyla indirildi!');
        } catch (error) {
            showMessage('error', `Dışa aktarma hatası: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCalendar = () => {
        if (!weeklyPlan || weeklyPlan.length === 0) {
            showMessage('error', 'Haftalık plan henüz oluşturulmadı!');
            return;
        }

        setLoading(true);
        try {
            downloadICS(weeklyPlan);
            showMessage('success', 'Takvim dosyası başarıyla indirildi!');
        } catch (error) {
            showMessage('error', `Takvim dışa aktarma hatası: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExportSessions = async () => {
        setLoading(true);
        try {
            await downloadSessionsICS();
            showMessage('success', 'Oturum geçmişi takvim dosyası olarak indirildi!');
        } catch (error) {
            showMessage('error', `Oturum dışa aktarma hatası: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    // ============ IMPORT HANDLERS ============

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showMessage('error', 'Lütfen .json uzantılı bir dosya seçin');
            return;
        }

        setLoading(true);
        try {
            const result: ImportResult = await importFromJSON(file, {
                replaceExisting: importOptions.replaceExisting,
                skipDuplicates: importOptions.skipDuplicates
            });

            if (result.success) {
                const imported = result.imported!;
                showMessage('success',
                    `İçe aktarıldı: ${imported.goals} hedef, ${imported.constraints} kısıt, ${imported.sessions} oturum` +
                    (imported.logs ? `, ${imported.logs} log` : '')
                );
                onImportComplete?.();
            } else {
                showMessage('error', `${result.message}: ${result.errors?.join(', ')}`);
            }
        } catch (error) {
            showMessage('error', `İçe aktarma hatası: ${error}`);
        } finally {
            setLoading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto mb-6">
            {/* Collapsible Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
            >
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📦</span>
                    <div className="text-left">
                        <h3 className="font-bold text-lg">Dışa Aktar / İçe Aktar</h3>
                        <p className="text-sm opacity-80">JSON ve ICS formatlarında veri transferi</p>
                    </div>
                </div>
                <svg
                    className={`w-6 h-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                    {/* Message Banner */}
                    {message && (
                        <div className={`px-6 py-3 text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border-b border-green-100' :
                                message.type === 'error' ? 'bg-red-50 text-red-800 border-b border-red-100' :
                                    'bg-blue-50 text-blue-800 border-b border-blue-100'
                            }`}>
                            {message.type === 'success' && '✅ '}
                            {message.type === 'error' && '❌ '}
                            {message.type === 'info' && 'ℹ️ '}
                            {message.text}
                        </div>
                    )}

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* EXPORT SECTION */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="text-lg">📤</span>
                                Dışa Aktar
                            </h4>

                            {/* JSON Export */}
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="font-semibold text-blue-900">JSON Formatı</h5>
                                        <p className="text-sm text-blue-700 mt-1">
                                            Tüm hedefler, kısıtlar ve oturumlar. Yedekleme ve cihazlar arası transfer için ideal.
                                        </p>
                                        <label className="flex items-center gap-2 mt-2 text-sm text-blue-700">
                                            <input
                                                type="checkbox"
                                                checked={importOptions.includeLogs}
                                                onChange={(e) => setImportOptions(prev => ({ ...prev, includeLogs: e.target.checked }))}
                                                className="rounded border-blue-300 text-blue-600"
                                            />
                                            Log kayıtlarını dahil et
                                        </label>
                                    </div>
                                    <button
                                        onClick={handleExportJSON}
                                        disabled={loading}
                                        className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                                    >
                                        {loading ? '...' : 'İndir'}
                                    </button>
                                </div>
                            </div>

                            {/* ICS Export - Weekly Plan */}
                            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-100">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="font-semibold text-purple-900">Haftalık Plan (ICS)</h5>
                                        <p className="text-sm text-purple-700 mt-1">
                                            Google Calendar, Outlook ve Apple Calendar'a aktarılabilir takvim dosyası.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleExportCalendar}
                                        disabled={loading || !weeklyPlan}
                                        className="shrink-0 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                                    >
                                        {loading ? '...' : 'İndir'}
                                    </button>
                                </div>
                            </div>

                            {/* ICS Export - Sessions */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-100">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="font-semibold text-green-900">Oturum Geçmişi (ICS)</h5>
                                        <p className="text-sm text-green-700 mt-1">
                                            Tamamlanan çalışma oturumlarını takvim formatında dışa aktar.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleExportSessions}
                                        disabled={loading}
                                        className="shrink-0 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                                    >
                                        {loading ? '...' : 'İndir'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* IMPORT SECTION */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <span className="text-lg">📥</span>
                                İçe Aktar
                            </h4>

                            {/* JSON Import */}
                            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border border-amber-100">
                                <h5 className="font-semibold text-amber-900">JSON Dosyasından Yükle</h5>
                                <p className="text-sm text-amber-700 mt-1 mb-3">
                                    Daha önce dışa aktarılmış bir yedek dosyasını yükleyin.
                                </p>

                                {/* Import Options */}
                                <div className="space-y-2 mb-4">
                                    <label className="flex items-center gap-2 text-sm text-amber-800">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.skipDuplicates}
                                            onChange={(e) => setImportOptions(prev => ({ ...prev, skipDuplicates: e.target.checked }))}
                                            className="rounded border-amber-300 text-amber-600"
                                        />
                                        Tekrar edenleri atla
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-amber-800">
                                        <input
                                            type="checkbox"
                                            checked={importOptions.replaceExisting}
                                            onChange={(e) => setImportOptions(prev => ({ ...prev, replaceExisting: e.target.checked }))}
                                            className="rounded border-amber-300 text-amber-600"
                                        />
                                        <span className="text-red-600 font-medium">Mevcut verileri sil ve değiştir</span>
                                    </label>
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                <button
                                    onClick={handleImportClick}
                                    disabled={loading}
                                    className="w-full bg-amber-600 text-white px-4 py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Yükleniyor...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            Dosya Seç ve Yükle
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Info Box */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-2">ℹ️ Bilgi</h5>
                                <ul className="text-sm text-gray-600 space-y-1">
                                    <li>• <strong>JSON:</strong> Tüm uygulamayı verilerini yedekler</li>
                                    <li>• <strong>ICS:</strong> Takvim uygulamalarına aktarım için</li>
                                    <li>• Veriler tarayıcınızda (IndexedDB) saklanır</li>
                                    <li>• Düzenli yedekleme önerilir</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
        </div>
    );
}
