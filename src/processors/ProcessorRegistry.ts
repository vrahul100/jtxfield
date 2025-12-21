import { DomainProcessor } from '../queue/types.js';
import { ConstructionProcessor } from './ConstructionProcessor.js';
import { LogisticsProcessor } from './LogisticsProcessor.js';

/**
 * Registry for domain processors.
 * Maps domain names to their processor implementations.
 */
class ProcessorRegistry {
    private processors: Map<string, DomainProcessor> = new Map();
    private defaultDomain: string = 'construction';

    constructor() {
        // Register built-in processors
        this.register(new ConstructionProcessor());
        this.register(new LogisticsProcessor());
    }

    /**
     * Register a domain processor
     */
    register(processor: DomainProcessor): void {
        this.processors.set(processor.domain, processor);
        console.log(`[ProcessorRegistry] Registered processor for domain: ${processor.domain}`);
    }

    /**
     * Get processor for a domain (falls back to default if not found)
     */
    get(domain: string): DomainProcessor {
        const processor = this.processors.get(domain);
        if (!processor) {
            console.warn(`[ProcessorRegistry] No processor for domain "${domain}", using default: ${this.defaultDomain}`);
            return this.processors.get(this.defaultDomain)!;
        }
        return processor;
    }

    /**
     * Check if a domain is registered
     */
    has(domain: string): boolean {
        return this.processors.has(domain);
    }

    /**
     * Get all registered domain names
     */
    getDomains(): string[] {
        return Array.from(this.processors.keys());
    }

    /**
     * Set the default domain to use when requested domain is not found
     */
    setDefaultDomain(domain: string): void {
        if (!this.has(domain)) {
            throw new Error(`Cannot set default to unregistered domain: ${domain}`);
        }
        this.defaultDomain = domain;
    }
}

// Singleton instance
const registry = new ProcessorRegistry();

export function getProcessorRegistry(): ProcessorRegistry {
    return registry;
}

export { ProcessorRegistry };
