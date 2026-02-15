import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface MiniSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ id: string; label: string }>;
    className?: string;
    disabled?: boolean;
}

/** Compact custom select menu for small spaces */
export const MiniSelect: React.FC<MiniSelectProps> = ({ value, onChange, options, className = '', disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.id === value);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full bg-black border border-cyber-border px-2 py-1.5 outline-none cursor-pointer flex items-center justify-center transition-colors text-xs font-mono rounded-button ${disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:border-cyber-accent/50'
                    } ${isOpen ? 'border-cyber-accent' : ''}`}
            >
                <span className="truncate text-cyber-text">{selectedOption?.label || '...'}</span>
                <ChevronDown
                    size={12}
                    className={`flex-shrink-0 ml-1 text-cyber-accent transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-px bg-black border border-cyber-accent/60 max-h-40 overflow-y-auto z-50 rounded-button">
                    {options.map((option) => (
                        <div
                            key={option.id}
                            onClick={() => {
                                onChange(option.id);
                                setIsOpen(false);
                            }}
                            className={`px-2 py-1.5 cursor-pointer transition-colors text-xs font-mono truncate text-center ${option.id === value
                                ? 'bg-cyber-accent/15 text-cyber-accent'
                                : 'text-cyber-text hover:bg-cyber-accent/10 hover:text-cyber-accent'
                                }`}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
