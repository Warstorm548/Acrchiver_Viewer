import openCloudConfig from '@opencloud-eu/eslint-config'

export default [...openCloudConfig, { ignores: ['dist', 'coverage', 'reference', '.__mf__temp'] }]
