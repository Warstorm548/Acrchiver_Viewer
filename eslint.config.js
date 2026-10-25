import openCloudConfig from '@opencloud-eu/eslint-config'

export default [...openCloudConfig, { ignores: ['dist', 'coverage', '.__mf__temp'] }]
