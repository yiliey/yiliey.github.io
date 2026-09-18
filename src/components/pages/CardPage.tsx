'use client';

import { motion } from 'framer-motion';
import { CardPageConfig } from '@/types/page';
import StreamingText from '@/components/ui/StreamingText';

export default function CardPage({ config, embedded = false }: { config: CardPageConfig; embedded?: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
        >
            <div className={embedded ? "mb-4" : "mb-8"}>
                <StreamingText as="h1" text={config.title} className={`${embedded ? "text-2xl" : "text-4xl"} font-serif font-bold text-primary mb-4`} />
                {config.description && (
                    <StreamingText
                        as="span"
                        text={config.description}
                        step={34}
                        className={`${embedded ? "text-base" : "text-lg"} text-neutral-600 dark:text-neutral-600 max-w-2xl block`}
                    />
                )}
            </div>

            <div className={`grid ${embedded ? "gap-4" : "gap-6"}`}>
                {config.items.map((item, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 * index }}
                        data-attend="" className={`surface ${embedded ? "p-4" : "p-6"} rounded-xl border`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h3 className={`${embedded ? "text-lg" : "text-xl"} font-semibold text-primary`}>{item.title}</h3>
                            {item.date && (
                                <span className="text-sm text-neutral-500 font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
                                    {item.date}
                                </span>
                            )}
                        </div>
                        {item.subtitle && (
                            <p className={`${embedded ? "text-sm" : "text-base"} text-accent/70 font-medium mb-3`}>{item.subtitle}</p>
                        )}
                        {item.content && (
                            <p className={`${embedded ? "text-sm" : "text-base"} text-neutral-600 dark:text-neutral-600 leading-relaxed`}>
                                {item.content}
                            </p>
                        )}
                        {item.tags && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {item.tags.map(tag => (
                                    <span key={tag} className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-800">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
